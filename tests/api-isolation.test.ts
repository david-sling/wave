import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRedis } from './fake-redis'
import type { WaveRedis } from '@/lib/redis'

/**
 * Cross-channel isolation and credential typing (PRODUCT section 10,
 * ARCHITECTURE section 7).
 *
 * Two properties, asserted over the real route handlers:
 *
 *   1. A channel ID is not access. Every credential minted for channel A is
 *      refused by channel B, on every endpoint.
 *   2. A credential is not a skeleton key for the channel that issued it. The
 *      invite cannot close, the admin token cannot speak, a participant token
 *      cannot admit anyone.
 *
 * Both fail closed with 401 rather than 403: the caller learns that what it
 * presented is not accepted here, and nothing about what would be.
 */

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
const { GET: pollRoute, POST: postRoute } = await import('@/app/api/v1/channels/[id]/messages/route')

const origin = 'https://wave.example.com'

function post(body: unknown, token?: string): Request {
  return new Request(`${origin}/api/v1/channels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

function get(token?: string): Request {
  return new Request(`${origin}/api/v1/channels/x/messages`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

/** A channel plus one joined agent, which is every credential type at once. */
async function openChannel(name: string) {
  const channel = await (await createRoute(post({ ttl: '1h', name }))).json()
  const agent = await (
    await joinRoute(post({ name: 'Resident agent', role: 'agent' }, channel.invite_token), context(channel.channel_id))
  ).json()
  return {
    id: channel.channel_id as string,
    invite: channel.invite_token as string,
    admin: channel.admin_token as string,
    participant: agent.participant_token as string,
  }
}

type Channel = Awaited<ReturnType<typeof openChannel>>

/**
 * Every authenticated endpoint, as a call that carries whatever token it is
 * handed. Named so a failure says which door was left open.
 */
const ENDPOINTS = [
  {
    name: 'GET /channels/:id',
    call: (id: string, token: string) => readRoute(get(token), context(id)),
  },
  {
    name: 'POST /channels/:id/join',
    call: (id: string, token: string) => joinRoute(post({ name: 'Intruder', role: 'agent' }, token), context(id)),
  },
  {
    name: 'POST /channels/:id/messages',
    call: (id: string, token: string) => postRoute(post({ text: 'knock knock' }, token), context(id)),
  },
  {
    name: 'GET /channels/:id/messages',
    call: (id: string, token: string) => pollRoute(get(token), context(id)),
  },
  {
    name: 'POST /channels/:id/leave',
    call: (id: string, token: string) => leaveRoute(post({}, token), context(id)),
  },
  {
    name: 'POST /channels/:id/close',
    call: (id: string, token: string) => closeRoute(post({}, token), context(id)),
  },
] as const

let a: Channel
let b: Channel

beforeEach(async () => {
  ;({ redis } = fakeRedis())
  a = await openChannel('Channel A')
  b = await openChannel('Channel B')
})

describe('cross-channel isolation', () => {
  const credentials = ['invite', 'participant', 'admin'] as const

  for (const endpoint of ENDPOINTS) {
    for (const credential of credentials) {
      it(`${endpoint.name} rejects channel A's ${credential} token`, async () => {
        const response = await endpoint.call(b.id, a[credential])
        expect(response.status).toBe(401)
        expect((await response.json()).error.code).toBe('unauthorized')
      })
    }
  }

  it('leaves channel B untouched after a rejected close from channel A', async () => {
    await closeRoute(post({}, a.admin), context(b.id))
    const response = await readRoute(get(b.invite), context(b.id))
    expect(response.status).toBe(200)
  })

  it('does not let channel A post into channel B', async () => {
    await postRoute(post({ text: 'from the other room' }, a.participant), context(b.id))
    const transcript = await (await pollRoute(get(b.participant), context(b.id))).json()
    expect(transcript.items.every((item: { text?: string }) => item.text !== 'from the other room')).toBe(true)
  })

  it('does not let channel A enumerate channel B by ID alone', async () => {
    const response = await readRoute(get(), context(b.id))
    expect(response.status).toBe(401)
  })
})

describe('credential type is enforced within one channel', () => {
  const wrong = [
    { endpoint: 'POST /channels/:id/join', credential: 'participant', expects: 'the invite' },
    { endpoint: 'POST /channels/:id/join', credential: 'admin', expects: 'the invite' },
    { endpoint: 'POST /channels/:id/messages', credential: 'invite', expects: 'a participant token' },
    { endpoint: 'POST /channels/:id/messages', credential: 'admin', expects: 'a participant token' },
    { endpoint: 'GET /channels/:id/messages', credential: 'admin', expects: 'a participant token or the invite' },
    { endpoint: 'POST /channels/:id/leave', credential: 'invite', expects: 'a participant token' },
    { endpoint: 'POST /channels/:id/leave', credential: 'admin', expects: 'a participant token' },
    { endpoint: 'POST /channels/:id/close', credential: 'invite', expects: 'the admin token' },
    { endpoint: 'POST /channels/:id/close', credential: 'participant', expects: 'the admin token' },
    { endpoint: 'GET /channels/:id', credential: 'admin', expects: 'the invite or a participant token' },
  ] as const

  for (const { endpoint, credential, expects } of wrong) {
    it(`${endpoint} rejects the ${credential} token; it wants ${expects}`, async () => {
      const found = ENDPOINTS.find((e) => e.name === endpoint)
      if (!found) throw new Error(`no such endpoint in this suite: ${endpoint}`)
      const response = await found.call(b.id, b[credential])
      expect(response.status).toBe(401)
    })
  }

  it('still accepts each credential on the endpoint that wants it', async () => {
    expect((await readRoute(get(b.invite), context(b.id))).status).toBe(200)
    expect((await pollRoute(get(b.participant), context(b.id))).status).toBe(200)
    expect((await closeRoute(post({}, b.admin), context(b.id))).status).toBe(200)
  })

  /**
   * Deliberate, and the channel page depends on it: a browser holding the
   * invite follows the conversation before anyone has typed into it. Reading
   * is not joining — the invite still cannot post, and its holder never
   * appears in the roster.
   */
  it('lets the invite read the stream without joining, but not speak', async () => {
    expect((await pollRoute(get(b.invite), context(b.id))).status).toBe(200)
    expect((await postRoute(post({ text: 'lurker' }, b.invite), context(b.id))).status).toBe(401)

    const roster = await (await pollRoute(get(b.invite), context(b.id))).json()
    expect(roster.participants).toHaveLength(1)
  })
})
