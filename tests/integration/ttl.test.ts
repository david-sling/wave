import { createClient } from 'redis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { channelKeys } from '@/lib/keys'
import { closeRedis, getRedis, type WaveRedis } from '@/lib/redis'

const { POST: createRoute } = await import('@/app/api/v1/channels/route')
const { POST: joinRoute } = await import('@/app/api/v1/channels/[id]/join/route')
const { POST: postRoute } = await import('@/app/api/v1/channels/[id]/messages/route')

const origin = 'https://wave.example.com'
const post = (body: unknown, token?: string) =>
  new Request(`${origin}/x`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

let redis: WaveRedis
let probe: ReturnType<typeof createClient>

beforeAll(async () => {
  redis = await getRedis()
  probe = createClient({ url: process.env.REDIS_URL })
  await probe.connect()
}, 30_000)

afterAll(async () => {
  for await (const b of redis.scanIterator({ MATCH: `${process.env.REDIS_PREFIX}:*`, COUNT: 200 })) {
    if (b.length > 0) await redis.del(b)
  }
  await closeRedis()
  await probe.close()
})

describe('retention after a full flow', () => {
  it('leaves no key of a channel without an expiry', async () => {
    const created = await (await createRoute(post({ ttl: '1h', name: 'ttl' }))).json()
    const id = created.channel_id as string
    const a = await (
      await joinRoute(post({ name: 'A', role: 'agent' }, created.invite_token), ctx(id))
    ).json()
    await (await joinRoute(post({ name: 'B', role: 'agent' }, created.invite_token), ctx(id))).json()
    await postRoute(post({ text: 'plain' }, a.participant_token), ctx(id))
    await postRoute(post({ text: 'with id', client_id: 'c1' }, a.participant_token), ctx(id))

    // Every key the channel owns, plus the idempotency key, which is not in that list.
    const everything: string[] = [...channelKeys(id)]
    for await (const batch of probe.scanIterator({ MATCH: `${process.env.REDIS_PREFIX}:ch:${id}*`, COUNT: 200 })) {
      for (const key of batch) if (!everything.includes(key)) everything.push(key)
    }

    const withoutExpiry: string[] = []
    for (const key of everything) {
      if ((await probe.exists(key)) === 1 && (await probe.ttl(key)) < 0) withoutExpiry.push(key)
    }

    expect(everything.length).toBeGreaterThan(5)
    expect(withoutExpiry).toEqual([])
  }, 30_000)
})
