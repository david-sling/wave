import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRedis, type FakeRedis } from './fake-redis'
import type { WaveRedis } from '@/lib/redis'

/** Join, leave, and the sweep route, over the real handlers. */

let fake: FakeRedis
let redis: WaveRedis

vi.mock('@/lib/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redis')>()),
  getRedis: async () => redis,
}))

const { POST: createRoute } = await import('@/app/api/v1/channels/route')
const { GET: readRoute } = await import('@/app/api/v1/channels/[id]/route')
const { POST: joinRoute } = await import('@/app/api/v1/channels/[id]/join/route')
const { POST: leaveRoute } = await import('@/app/api/v1/channels/[id]/leave/route')
const { POST: closeRoute } = await import('@/app/api/v1/channels/[id]/close/route')
const { GET: sweepRoute } = await import('@/app/api/cron/sweep/route')

const origin = 'https://wave.example.com'

function post(body: unknown, token?: string): Request {
  return new Request(`${origin}/api/v1/channels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function create(body: unknown = { ttl: '1h' }) {
  return (await createRoute(post(body))).json()
}

async function join(id: string, invite: string, name = 'Windows agent') {
  const response = await joinRoute(post({ name, role: 'agent', client: 'codex-cli' }, invite), context(id))
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  ;({ fake, redis } = fakeRedis())
})

describe('POST /api/v1/channels/:id/join', () => {
  it('joins with the invite and returns a cursor past its own arrival', async () => {
    const channel = await create()
    const { status, body } = await join(channel.channel_id, channel.invite_token)

    expect(status).toBe(200)
    expect(body.participant_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.name).toBe('Windows agent')
    expect(body.channel).toEqual({
      name: '',
      mode: 'standard',
      expires_at: expect.stringMatching(/Z$/),
      max_participants: 10,
    })
    expect(body.participants).toEqual([
      { id: body.participant_id, name: 'Windows agent', role: 'agent', presence: 'active' },
    ])
    expect(body.last_seq).toBe(1)
    expect(JSON.stringify(body)).not.toContain('token_hash')
  })

  it('suffixes a name already in the channel', async () => {
    const channel = await create()
    await join(channel.channel_id, channel.invite_token, "David's agent")
    const second = await join(channel.channel_id, channel.invite_token, "David's agent")
    expect(second.body.name).toBe("David's agent (2)")
  })

  it('refuses the admin token, a participant token, and no token', async () => {
    const channel = await create()
    const { body: joined } = await join(channel.channel_id, channel.invite_token)

    expect((await joinRoute(post({ name: 'A' }, channel.admin_token), context(channel.channel_id))).status).toBe(401)
    expect(
      (await joinRoute(post({ name: 'A' }, joined.participant_token), context(channel.channel_id))).status,
    ).toBe(401)
    expect((await joinRoute(post({ name: 'A' }), context(channel.channel_id))).status).toBe(401)
  })

  it('refuses an invite from another channel', async () => {
    const channel = await create()
    const other = await create()
    expect(
      (await joinRoute(post({ name: 'A' }, other.invite_token), context(channel.channel_id))).status,
    ).toBe(401)
  })

  it('rejects a missing or oversized name with 400', async () => {
    const channel = await create()
    for (const body of [{ role: 'agent' }, { name: '   ' }, { name: 'x'.repeat(41) }]) {
      const response = await joinRoute(post(body, channel.invite_token), context(channel.channel_id))
      expect(response.status).toBe(400)
      expect((await response.json()).error.code).toBe('invalid_request')
    }
  })

  it('answers 409 when the cap is reached, with something the agent can relay', async () => {
    const channel = await create({ ttl: '1h', max_participants: 2 })
    await join(channel.channel_id, channel.invite_token, 'First')
    await join(channel.channel_id, channel.invite_token, 'Second')

    const response = await joinRoute(post({ name: 'Third' }, channel.invite_token), context(channel.channel_id))
    expect(response.status).toBe(409)
    const payload = await response.json()
    expect(payload.error.code).toBe('channel_full')
    expect(payload.error.message).toContain('2 participants')
  })

  it('answers 410 once the channel is closed', async () => {
    const channel = await create()
    await closeRoute(post({}, channel.admin_token), context(channel.channel_id))
    expect(
      (await joinRoute(post({ name: 'A' }, channel.invite_token), context(channel.channel_id))).status,
    ).toBe(410)
  })
})

describe('POST /api/v1/channels/:id/leave', () => {
  it('leaves, announces it, and retires the token', async () => {
    const channel = await create()
    const { body: joined } = await join(channel.channel_id, channel.invite_token)

    const response = await leaveRoute(post({}, joined.participant_token), context(channel.channel_id))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ left: true, participant_id: joined.participant_id })

    const second = await leaveRoute(post({}, joined.participant_token), context(channel.channel_id))
    expect(second.status).toBe(401)
    expect((await second.json()).error.message).toMatch(/left this channel/i)
  })

  it('keeps the leaver in the roster as gone', async () => {
    const channel = await create()
    const { body: joined } = await join(channel.channel_id, channel.invite_token)
    await leaveRoute(post({}, joined.participant_token), context(channel.channel_id))

    const view = await (await readRoute(new Request(origin, {
      headers: { authorization: `Bearer ${channel.invite_token}` },
    }), context(channel.channel_id))).json()

    expect(view.participants).toEqual([
      { id: joined.participant_id, name: 'Windows agent', role: 'agent', presence: 'gone' },
    ])
    expect(view.last_seq).toBe(2)
  })

  it('refuses the invite token and a participant from another channel', async () => {
    const channel = await create()
    const other = await create()
    const { body: elsewhere } = await join(other.channel_id, other.invite_token)

    expect((await leaveRoute(post({}, channel.invite_token), context(channel.channel_id))).status).toBe(401)
    expect(
      (await leaveRoute(post({}, elsewhere.participant_token), context(channel.channel_id))).status,
    ).toBe(401)
  })
})

describe('GET /api/cron/sweep', () => {
  const cronRequest = (token?: string) =>
    new Request(`${origin}/api/cron/sweep`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })

  it('rejects a caller without the cron secret', async () => {
    expect((await sweepRoute(cronRequest())).status).toBe(401)
    expect((await sweepRoute(cronRequest('not-the-secret'))).status).toBe(401)
  })

  it('reports what it swept', async () => {
    await create()
    const response = await sweepRoute(cronRequest(process.env.CRON_SECRET))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ swept: 1, retired: 0, timed_out: 0, expiring: 0 })
  })

  it('leaves no channel keys behind for a channel it retires', async () => {
    const channel = await create()
    await fake.zAdd('wave:channels:active', { score: 1, value: channel.channel_id })
    await sweepRoute(cronRequest(process.env.CRON_SECRET))
    expect(await redis.zRangeByScore('wave:channels:active', 0, Number.MAX_SAFE_INTEGER)).toEqual([])
  })
})
