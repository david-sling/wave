import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRedis } from './fake-redis'
import { keys } from '@/lib/keys'
import { LIMITS, PRESENCE } from '@/lib/limits'
import { saveParticipant } from '@/lib/participants'
import type { WaveRedis } from '@/lib/redis'
import { epochSeconds } from '@/lib/time'
import { parseChannel, parseParticipant } from '@/lib/types'

/** Post and long-poll, over the real handlers. */

let redis: WaveRedis

vi.mock('@/lib/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redis')>()),
  getRedis: async () => redis,
}))

const { POST: createRoute } = await import('@/app/api/v1/channels/route')
const { POST: joinRoute } = await import('@/app/api/v1/channels/[id]/join/route')
const { POST: leaveRoute } = await import('@/app/api/v1/channels/[id]/leave/route')
const { GET: pollRoute, POST: postRoute } = await import('@/app/api/v1/channels/[id]/messages/route')

const origin = 'https://wave.example.com'

function post(body: unknown, token?: string): Request {
  return new Request(`${origin}/api/v1/channels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

function poll(query: string, token?: string): Request {
  return new Request(`${origin}/api/v1/channels/x/messages${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function openChannel() {
  const channel = await (await createRoute(post({ ttl: '1h' }))).json()
  const agent = await (
    await joinRoute(post({ name: 'Windows agent', role: 'agent' }, channel.invite_token), context(channel.channel_id))
  ).json()
  return { channel, agent }
}

beforeEach(() => {
  ;({ redis } = fakeRedis())
})

describe('POST /api/v1/channels/:id/messages', () => {
  it('posts and returns the sequence number and timestamp', async () => {
    const { channel, agent } = await openChannel()
    const response = await postRoute(post({ text: 'Build passes.' }, agent.participant_token), context(channel.channel_id))

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.seq).toBe(2)
    expect(body.ts).toMatch(/Z$/)
  })

  it('refuses the invite token: reading a channel does not make you part of it', async () => {
    const { channel } = await openChannel()
    const response = await postRoute(post({ text: 'hello' }, channel.invite_token), context(channel.channel_id))
    expect(response.status).toBe(401)
  })

  it('refuses a participant of another channel', async () => {
    const { channel } = await openChannel()
    const elsewhere = await openChannel()
    const response = await postRoute(
      post({ text: 'hello' }, elsewhere.agent.participant_token),
      context(channel.channel_id),
    )
    expect(response.status).toBe(401)
  })

  it('refuses someone who has left', async () => {
    const { channel, agent } = await openChannel()
    await leaveRoute(post({}, agent.participant_token), context(channel.channel_id))
    const response = await postRoute(post({ text: 'still here' }, agent.participant_token), context(channel.channel_id))
    expect(response.status).toBe(401)
  })

  it('answers 413 with the limit stated, so the agent can split the message', async () => {
    const { channel, agent } = await openChannel()
    const response = await postRoute(
      post({ text: 'x'.repeat(65 * 1024) }, agent.participant_token),
      context(channel.channel_id),
    )

    expect(response.status).toBe(413)
    const payload = await response.json()
    expect(payload.error.code).toBe('too_large')
    expect(payload.error.hint).toMatch(/split/i)
  })
})

describe('GET /api/v1/channels/:id/messages', () => {
  it('returns everything after the cursor, with the roster', async () => {
    const { channel, agent } = await openChannel()
    await postRoute(post({ text: 'one' }, agent.participant_token), context(channel.channel_id))

    const response = await pollRoute(poll('?after=0', agent.participant_token), context(channel.channel_id))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items.map((item: { type: string }) => item.type)).toEqual(['system', 'message'])
    expect(body.last_seq).toBe(2)
    expect(body.participants).toEqual([
      { id: agent.participant_id, name: 'Windows agent', role: 'agent', presence: 'active' },
    ])
  })

  it('returns immediately with nothing when the cursor is current', async () => {
    const { channel, agent } = await openChannel()
    const started = Date.now()
    const response = await pollRoute(poll('?after=1', agent.participant_token), context(channel.channel_id))

    expect(await response.json()).toMatchObject({ items: [], last_seq: 1 })
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('holds the request when asked to wait, then returns empty', async () => {
    const { channel, agent } = await openChannel()
    const started = Date.now()
    const response = await pollRoute(poll('?after=1&wait=1', agent.participant_token), context(channel.channel_id))

    expect(await response.json()).toMatchObject({ items: [] })
    expect(Date.now() - started).toBeGreaterThanOrEqual(900)
  })

  it('lets a reader follow with the invite, without joining the roster', async () => {
    const { channel } = await openChannel()
    const response = await pollRoute(poll('?after=0', channel.invite_token), context(channel.channel_id))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items).toHaveLength(1)
    expect(body.participants).toHaveLength(1)
  })

  it('announces a participant that comes back after timing out', async () => {
    const { channel, agent } = await openChannel()
    const [raw] = await redis.hVals(keys.parts(channel.channel_id))
    const participant = parseParticipant(raw)
    const stored = parseChannel(await redis.hGetAll(keys.channel(channel.channel_id)))!
    await saveParticipant(redis, stored, {
      ...participant,
      state: 'gone',
      last_seen: epochSeconds() - PRESENCE.goneAfter - 1,
    })

    const response = await pollRoute(poll('?after=1', agent.participant_token), context(channel.channel_id))
    const body = await response.json()

    expect(body.items.map((item: { event: string }) => item.event)).toEqual(['participant.rejoined'])
    expect(body.participants[0].presence).toBe('active')
  })

  it('refuses a caller that keeps polling without waiting', async () => {
    const { channel, agent } = await openChannel()
    const ask = () => pollRoute(poll('?after=99', agent.participant_token), context(channel.channel_id))

    for (let n = 0; n < LIMITS.immediatePollsPerMinute; n += 1) {
      expect((await ask()).status).toBe(200)
    }

    const refused = await ask()
    expect(refused.status).toBe(429)
    expect(refused.headers.get('Retry-After')).toBeTruthy()
  })

  it('does not spend that budget on a poll that waits, which is bounded already', async () => {
    const { channel, agent } = await openChannel()
    for (let n = 0; n < LIMITS.immediatePollsPerMinute; n += 1) {
      await pollRoute(poll('?after=99', agent.participant_token), context(channel.channel_id))
    }

    // Nothing immediate is allowed now. A held poll is a different thing: two
    // at a time for fifty seconds each is its own limit, and the counter that
    // would cost every waiting agent a write is deliberately not on that path.
    const held = await pollRoute(poll('?after=99&wait=1', agent.participant_token), context(channel.channel_id))
    expect(held.status).toBe(200)
  })

  it('counts a reader on the invite by where they are calling from', async () => {
    const { channel } = await openChannel()
    const ask = () => pollRoute(poll('?after=99', channel.invite_token), context(channel.channel_id))

    for (let n = 0; n < LIMITS.immediatePollsPerMinute; n += 1) await ask()
    expect((await ask()).status).toBe(429)
  })

  it('rejects a cursor that is not a number', async () => {
    const { channel, agent } = await openChannel()
    const response = await pollRoute(poll('?after=yesterday', agent.participant_token), context(channel.channel_id))
    expect(response.status).toBe(400)
  })
})

describe('a conversation', () => {
  it('carries both agents and the events between them', async () => {
    const { channel, agent } = await openChannel()
    const second = await (
      await joinRoute(post({ name: 'Mac agent', role: 'agent' }, channel.invite_token), context(channel.channel_id))
    ).json()

    await postRoute(post({ text: 'Windows build passes.' }, agent.participant_token), context(channel.channel_id))
    await postRoute(
      post({ text: 'Mac build passes too.', kind: 'done', reply_to: 3 }, second.participant_token),
      context(channel.channel_id),
    )
    await leaveRoute(post({}, second.participant_token), context(channel.channel_id))

    const body = await (
      await pollRoute(poll(`?after=${agent.last_seq}`, agent.participant_token), context(channel.channel_id))
    ).json()

    expect(
      body.items.map((item: { type: string; event?: string; kind?: string }) => item.event ?? item.kind),
    ).toEqual(['participant.joined', 'message', 'done', 'participant.left'])
    expect(body.participants.map((p: { presence: string }) => p.presence)).toEqual(['active', 'gone'])
  })
})
