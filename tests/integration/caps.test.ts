import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { keys } from '@/lib/keys'
import { LIMITS } from '@/lib/limits'
import { closeRedis, getRedis, type WaveRedis } from '@/lib/redis'

/** The channel caps under concurrent requests, against a real Redis (#101). */

const { POST: createRoute } = await import('@/app/api/v1/channels/route')
const { POST: joinRoute } = await import('@/app/api/v1/channels/[id]/join/route')
const { POST: postRoute } = await import('@/app/api/v1/channels/[id]/messages/route')

function post(body: unknown, token?: string): Request {
  return new Request('https://wave.example.com/api/v1/channels', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

let redis: WaveRedis

beforeAll(async () => {
  redis = await getRedis()
}, 30_000)

afterAll(async () => {
  for await (const batch of redis.scanIterator({ MATCH: `${process.env.REDIS_PREFIX}:*`, COUNT: 200 })) {
    if (batch.length > 0) await redis.del(batch)
  }
  await closeRedis()
})

describe('caps under concurrency', () => {
  it('lets exactly two of ten simultaneous joins into a channel of two', async () => {
    const created = await (await createRoute(post({ ttl: '1h', max_participants: 2 }))).json()
    const joins = await Promise.all(
      Array.from({ length: 10 }, () =>
        joinRoute(post({ name: 'Racer', role: 'agent' }, created.invite_token), context(created.channel_id)),
      ),
    )

    const statuses = joins.map((response) => response.status)
    expect(statuses.filter((status) => status === 200)).toHaveLength(2)
    expect(statuses.filter((status) => status === 409)).toHaveLength(8)
    const names = await Promise.all(joins.filter((r) => r.status === 200).map(async (r) => (await r.json()).name))
    expect(new Set(names).size).toBe(2)
  })

  it('lets exactly one of several simultaneous posts take the last item', async () => {
    const created = await (await createRoute(post({ ttl: '1h' }))).json()
    const agent = await (
      await joinRoute(post({ name: 'Poster', role: 'agent' }, created.invite_token), context(created.channel_id))
    ).json()
    await redis.set(keys.seq(created.channel_id), String(LIMITS.maxItemsPerChannel - 1))

    const posts = await Promise.all(
      Array.from({ length: 5 }, (_, n) =>
        postRoute(post({ text: `last ${n}` }, agent.participant_token), context(created.channel_id)),
      ),
    )

    const statuses = posts.map((response) => response.status)
    expect(statuses.filter((status) => status === 201)).toHaveLength(1)
    expect(statuses.filter((status) => status === 413)).toHaveLength(4)
  })
})
