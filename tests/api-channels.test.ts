import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRedis, type FakeRedis } from './fake-redis'
import type { WaveRedis } from '@/lib/redis'

/**
 * The create, read, and close endpoints end to end, over the real route
 * handlers with an in-memory Redis underneath.
 */

let fake: FakeRedis
let redis: WaveRedis

vi.mock('@/lib/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redis')>()),
  getRedis: async () => redis,
}))

const { POST: createRoute } = await import('@/app/api/v1/channels/route')
const { GET: readRoute } = await import('@/app/api/v1/channels/[id]/route')
const { POST: closeRoute } = await import('@/app/api/v1/channels/[id]/close/route')

const url = 'https://wave.example.com/api/v1/channels'

function post(body: unknown, token?: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

function get(token?: string): Request {
  return new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} })
}

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function create(body: unknown = { ttl: '1h', name: 'Release 4.2' }) {
  const response = await createRoute(post(body))
  return { response, body: await response.json() }
}

beforeEach(() => {
  ;({ fake, redis } = fakeRedis())
})

describe('POST /api/v1/channels', () => {
  it('creates a channel and hands back both tokens once', async () => {
    const { response, body } = await create()
    expect(response.status).toBe(201)
    expect(body.channel_id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(body.invite_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.admin_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.expires_at).toMatch(/Z$/)
    expect(body.url).toBe(`https://wave.example.com/c/${body.channel_id}#${body.invite_token}`)
  })

  it.each([
    ['an unknown ttl', { ttl: '30m' }],
    ['no ttl', { name: 'nameless' }],
    ['a cap over the hard limit', { ttl: '1h', max_participants: 51 }],
    ['the coming-soon mode', { ttl: '1h', mode: 'e2ee' }],
  ])('rejects %s with 400 and a hint', async (_label, body) => {
    const response = await createRoute(post(body))
    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error.code).toBe('invalid_request')
    expect(payload.error.hint).toBeTruthy()
  })

  it('rejects a body that is not JSON', async () => {
    const response = await createRoute(
      new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' }),
    )
    expect(response.status).toBe(400)
  })
})

describe('GET /api/v1/channels/:id', () => {
  it('reads with the invite token', async () => {
    const { body: created } = await create()
    const response = await readRoute(get(created.invite_token), context(created.channel_id))
    expect(response.status).toBe(200)

    const view = await response.json()
    expect(view.channel).toMatchObject({ id: created.channel_id, name: 'Release 4.2', max_participants: 10 })
    expect(view.participants).toEqual([])
    expect(view.last_seq).toBe(0)
    expect(JSON.stringify(view)).not.toContain('hash')
  })

  it('rejects the admin token, a missing token, and a token from another channel', async () => {
    const { body: created } = await create()
    const { body: other } = await create()

    expect((await readRoute(get(created.admin_token), context(created.channel_id))).status).toBe(401)
    expect((await readRoute(get(), context(created.channel_id))).status).toBe(401)
    expect((await readRoute(get(other.invite_token), context(created.channel_id))).status).toBe(401)
  })

  it('returns 410 for an unknown channel, whatever the token', async () => {
    const { body: created } = await create()
    const response = await readRoute(get(created.invite_token), context('AAAAAAAAAAAAAAAAAAAAAA'))
    expect(response.status).toBe(410)
    expect((await response.json()).error.code).toBe('gone')
  })
})

describe('POST /api/v1/channels/:id/close', () => {
  it('purges the channel and answers 410 afterwards', async () => {
    const { body: created } = await create()
    const closed = await closeRoute(post({}, created.admin_token), context(created.channel_id))
    expect(closed.status).toBe(200)
    expect(await closed.json()).toEqual({ closed: true, channel_id: created.channel_id })

    expect(fake.keys().some((key) => key.includes(created.channel_id))).toBe(false)
    expect((await readRoute(get(created.invite_token), context(created.channel_id))).status).toBe(410)
    expect((await closeRoute(post({}, created.admin_token), context(created.channel_id))).status).toBe(410)
  })

  it('refuses the invite token and a token from another channel', async () => {
    const { body: created } = await create()
    const { body: other } = await create()

    expect((await closeRoute(post({}, created.invite_token), context(created.channel_id))).status).toBe(401)
    expect((await closeRoute(post({}, other.admin_token), context(created.channel_id))).status).toBe(401)
    expect(fake.keys().some((key) => key.includes(created.channel_id))).toBe(true)
  })
})
