import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRedis, type FakeRedis } from './fake-redis'
import { keys } from '@/lib/keys'
import { LIMITS } from '@/lib/limits'
import type { WaveRedis } from '@/lib/redis'

/** GET /api/v1/channels/:id/head, over the real handlers. */

let fake: FakeRedis
let redis: WaveRedis

vi.mock('@/lib/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redis')>()),
  getRedis: async () => redis,
}))

const { POST: createRoute } = await import('@/app/api/v1/channels/route')
const { POST: joinRoute } = await import('@/app/api/v1/channels/[id]/join/route')
const { GET: pollRoute, POST: postRoute } = await import('@/app/api/v1/channels/[id]/messages/route')
const { GET: headRoute } = await import('@/app/api/v1/channels/[id]/head/route')

const origin = 'https://wave.example.com'

function post(body: unknown, token?: string): Request {
  return new Request(`${origin}/api/v1/channels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

function get(path: string, token?: string, address = '198.51.100.7'): Request {
  return new Request(`${origin}${path}`, {
    headers: { 'x-forwarded-for': address, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })
}

const context = (id: string) => ({ params: Promise.resolve({ id }) })
const head = (id: string, token?: string, address?: string) =>
  headRoute(get(`/api/v1/channels/${id}/head`, token, address), context(id))

async function openChannel() {
  const channel = await (await createRoute(post({ ttl: '1h', name: 'Head test' }))).json()
  const agent = await (
    await joinRoute(post({ name: 'Resident agent', role: 'agent' }, channel.invite_token), context(channel.channel_id))
  ).json()
  return {
    id: channel.channel_id as string,
    invite: channel.invite_token as string,
    participantId: agent.participant_id as string,
    participant: agent.participant_token as string,
  }
}

type Channel = Awaited<ReturnType<typeof openChannel>>
let room: Channel

const participantRecord = async () => JSON.parse((await redis.hGetAll(keys.parts(room.id)))[room.participantId])

beforeEach(async () => {
  ;({ fake, redis } = fakeRedis())
  room = await openChannel()
})

describe('GET /api/v1/channels/:id/head', () => {
  it('answers with the two heads and the expiry, and nothing else', async () => {
    const response = await head(room.id, room.invite)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['expires_at', 'last_message_seq', 'last_seq'])
    expect(body).toMatchObject({ last_seq: 1, last_message_seq: 0, expires_at: expect.stringMatching(/Z$/) })
  })

  it('moves last_message_seq when someone speaks', async () => {
    await postRoute(post({ text: 'hello' }, room.participant), context(room.id))
    expect(await (await head(room.id, room.invite)).json()).toMatchObject({ last_seq: 2, last_message_seq: 2 })
  })

  it('takes a participant token too', async () => {
    expect((await head(room.id, room.participant)).status).toBe(200)
  })

  it('leaves the prober’s presence and read receipt where they were', async () => {
    await pollRoute(get(`/api/v1/channels/${room.id}/messages?after=1`, room.participant), context(room.id))
    const before = await participantRecord()
    await postRoute(post({ text: 'unread' }, room.participant), context(room.id))
    const afterPost = await participantRecord()

    vi.useFakeTimers({ now: Date.now() + 120_000 })
    try {
      await head(room.id, room.participant)
    } finally {
      vi.useRealTimers()
    }

    const after = await participantRecord()
    expect(after.last_seen).toBe(afterPost.last_seen)
    expect(after.read_seq).toBe(before.read_seq)
  })

  it('does not sweep: a silent participant is not timed out by a probe', async () => {
    const stale = await participantRecord()
    await redis.hSet(keys.parts(room.id), {
      [room.participantId]: JSON.stringify({ ...stale, last_seen: stale.last_seen - 3_600 }),
    })
    expect(await (await head(room.id, room.invite)).json()).toMatchObject({ last_seq: 1 })
    expect((await participantRecord()).state).toBe(stale.state)
  })

  it.each([
    ['unknown', 'A'.repeat(22)],
    ['malformed', 'nope'],
  ])('is 410 for an %s id', async (_, id) => {
    expect((await head(id, room.invite)).status).toBe(410)
  })

  it('is 410 for an expired channel', async () => {
    await redis.hSet(keys.channel(room.id), { expires_at: String(Math.floor(Date.now() / 1000) - 1) })
    expect((await head(room.id, room.invite)).status).toBe(410)
  })

  it('is 401 without a token', async () => {
    expect((await head(room.id)).status).toBe(401)
  })

  it(`allows ${LIMITS.headProbesPerMinute} a minute per channel and caller, then 429s with Retry-After`, async () => {
    for (let i = 0; i < LIMITS.headProbesPerMinute; i++) expect((await head(room.id, room.invite)).status).toBe(200)
    const refused = await head(room.id, room.invite)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('Retry-After')).toMatch(/^\d+$/)
  })

  it('keeps its own bucket: probing to the limit leaves polling alone', async () => {
    for (let i = 0; i <= LIMITS.headProbesPerMinute; i++) await head(room.id, room.invite)
    const poll = await pollRoute(get(`/api/v1/channels/${room.id}/messages?wait=0`, room.invite), context(room.id))
    expect(poll.status).toBe(200)
  })

  it('counts each channel separately, so one busy room cannot starve another', async () => {
    const other = await openChannel()
    for (let i = 0; i <= LIMITS.headProbesPerMinute; i++) await head(room.id, room.invite)
    expect((await head(other.id, other.invite)).status).toBe(200)
  })

  it('writes nothing but its own rate-limit counter', async () => {
    const before = new Set(fake.keys())
    await head(room.id, room.invite)
    const added = fake.keys().filter((key: string) => !before.has(key))
    expect(added.every((key: string) => key.startsWith(keys.rateLimit('head', '')))).toBe(true)
  })
})
