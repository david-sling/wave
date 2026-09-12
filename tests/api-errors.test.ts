import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRedis } from './fake-redis'
import { LIMITS } from '@/lib/limits'
import type { WaveRedis } from '@/lib/redis'

/**
 * The failure contract, over the real route handlers (PRODUCT section 8).
 *
 * An agent reads these responses with `jq` and decides what to do next, so the
 * status code is only half of it: every failure must also carry a machine
 * `code` and a sentence the agent can relay to its human. The status codes
 * themselves are covered per endpoint elsewhere — cross-channel and credential
 * typing in api-isolation, 409/410 in api-participants and api-channels, 413
 * in api-messages.
 *
 * What lives here is what those leave out: the cases that were only ever
 * proved a layer down, in lib, and never through a route — the secret filter's
 * 422, the rate limiter's 429 — plus the idempotent post, which had no test at
 * all.
 */

let redis: WaveRedis

vi.mock('@/lib/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redis')>()),
  getRedis: async () => redis,
}))

const { POST: createRoute } = await import('@/app/api/v1/channels/route')
const { POST: joinRoute } = await import('@/app/api/v1/channels/[id]/join/route')
const { GET: pollRoute, POST: postRoute } = await import('@/app/api/v1/channels/[id]/messages/route')

const origin = 'https://wave.example.com'

function post(body: unknown, token?: string, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}/api/v1/channels`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function openChannel() {
  const channel = await (await createRoute(post({ ttl: '1h' }))).json()
  const agent = await (
    await joinRoute(post({ name: 'Agent', role: 'agent' }, channel.invite_token), context(channel.channel_id))
  ).json()
  return { id: channel.channel_id as string, invite: channel.invite_token as string, token: agent.participant_token as string }
}

beforeEach(() => {
  ;({ redis } = fakeRedis())
})

/**
 * Every error an agent can provoke answers in the same shape. A handler that
 * threw a bare string would still return the right status and break every
 * agent reading the reply.
 */
describe('the error envelope', () => {
  it('carries a code and a message on every failure, whatever the status', async () => {
    const channel = await openChannel()

    const failures = await Promise.all([
      postRoute(post({ text: 'hi' }), context(channel.id)), // 401, no token
      postRoute(post({ text: '' }, channel.token), context(channel.id)), // 400, empty text
      postRoute(post({ text: 'x'.repeat(LIMITS.maxMessageBytes + 1) }, channel.token), context(channel.id)), // 413
      pollRoute(new Request(`${origin}/x`), context('not-a-channel-id')), // 410
    ])

    for (const response of failures) {
      expect(response.ok).toBe(false)
      const { error } = await response.json()
      expect(typeof error.code).toBe('string')
      expect(error.code.length).toBeGreaterThan(0)
      expect(typeof error.message).toBe('string')
      expect(error.message.length).toBeGreaterThan(0)
    }
  })
})

describe('422 from the secret filter, through the route', () => {
  it('refuses a message carrying a credential and says what it matched', async () => {
    const channel = await openChannel()
    const response = await postRoute(
      post({ text: 'here you go: AKIA4Z9QKJ3MXNPLQR7T' }, channel.token),
      context(channel.id),
    )

    expect(response.status).toBe(422)
    const { error } = await response.json()
    expect(error.code).toBe('rejected_content')
    expect(error.message).toContain('AWS access key ID')
    expect(error.hint).toBeTruthy()
  })

  it('posts nothing when it refuses, so the credential never reaches the transcript', async () => {
    const channel = await openChannel()
    const secret = 'AKIA4Z9QKJ3MXNPLQR7T'
    await postRoute(post({ text: secret }, channel.token), context(channel.id))

    const transcript = await (await pollRoute(new Request(`${origin}/x`, {
      headers: { authorization: `Bearer ${channel.token}` },
    }), context(channel.id))).json()

    expect(JSON.stringify(transcript)).not.toContain(secret)
  })

  it('does not repeat the secret back in the error', async () => {
    const channel = await openChannel()
    const secret = 'AKIA4Z9QKJ3MXNPLQR7T'
    const response = await postRoute(post({ text: secret }, channel.token), context(channel.id))
    expect(JSON.stringify(await response.json())).not.toContain(secret)
  })

  it('lets ordinary code through, since a filter that blocks work is worse than none', async () => {
    const channel = await openChannel()
    const response = await postRoute(
      post({ text: 'const key = process.env.API_KEY\nif (!key) throw new Error("set API_KEY")' }, channel.token),
      context(channel.id),
    )
    expect(response.status).toBe(201)
  })
})

describe('429 from the rate limiter, through the route', () => {
  it('stops a participant that floods the channel, and says when to retry', async () => {
    const channel = await openChannel()

    let limited: Response | undefined
    for (let i = 0; i <= LIMITS.messagesPerMinute; i++) {
      const response = await postRoute(post({ text: `message ${i}` }, channel.token), context(channel.id))
      if (response.status === 429) {
        limited = response
        break
      }
    }

    expect(limited).toBeDefined()
    const { error } = await limited!.json()
    expect(error.code).toBe('rate_limited')
    expect(Number(limited!.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('stops one address opening channels without end', async () => {
    const address = { 'x-forwarded-for': '198.51.100.7' }

    let limited: Response | undefined
    for (let i = 0; i <= LIMITS.createsPerHourPerIp; i++) {
      const response = await createRoute(post({ ttl: '1h' }, undefined, address))
      if (response.status === 429) {
        limited = response
        break
      }
    }

    expect(limited).toBeDefined()
    expect((await limited!.json()).error.code).toBe('rate_limited')
  })

  it('counts each participant separately, so one noisy agent cannot mute another', async () => {
    const channel = await openChannel()
    const second = await (
      await joinRoute(post({ name: 'Second', role: 'agent' }, channel.invite), context(channel.id))
    ).json()

    for (let i = 0; i <= LIMITS.messagesPerMinute; i++) {
      const response = await postRoute(post({ text: `noise ${i}` }, channel.token), context(channel.id))
      if (response.status === 429) break
    }

    const quiet = await postRoute(post({ text: 'still here' }, second.participant_token), context(channel.id))
    expect(quiet.status).toBe(201)
  })
})

/**
 * An agent that retries a post it never saw the answer to must not say the
 * same thing twice. The prompt tells agents to retry, so this is the property
 * that keeps that advice safe.
 */
describe('idempotent post', () => {
  it('returns the first seq again rather than posting twice', async () => {
    const channel = await openChannel()
    const body = { text: 'Build passes.', client_id: 'retry-me' }

    const first = await (await postRoute(post(body, channel.token), context(channel.id))).json()
    const second = await (await postRoute(post(body, channel.token), context(channel.id))).json()

    expect(second.seq).toBe(first.seq)
    expect(second.ts).toBe(first.ts)

    const transcript = await (await pollRoute(new Request(`${origin}/x`, {
      headers: { authorization: `Bearer ${channel.token}` },
    }), context(channel.id))).json()
    const said = transcript.items.filter((item: { text?: string }) => item.text === 'Build passes.')
    expect(said).toHaveLength(1)
  })

  it('treats a different client_id as a different message', async () => {
    const channel = await openChannel()
    const first = await (
      await postRoute(post({ text: 'one', client_id: 'a' }, channel.token), context(channel.id))
    ).json()
    const second = await (
      await postRoute(post({ text: 'one', client_id: 'b' }, channel.token), context(channel.id))
    ).json()

    expect(second.seq).not.toBe(first.seq)
  })

})
