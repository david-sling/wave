import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { keys } from '@/lib/keys'
import { metricDay, readMetric } from '@/lib/metrics'
import { closeRedis, getRedis, type WaveRedis } from '@/lib/redis'

/**
 * The full agent flow against a real Redis (#26).
 *
 * Every other suite runs on `tests/fake-redis.ts`, which is a hand-written
 * stand-in. That fake is only ever as right as its author guessed, so this
 * file exists to check the guesses: real TTL arithmetic, real sorted-set
 * ordering, a real SCAN-and-delete on close, and a real long-poll that has to
 * actually wait.
 *
 * Runs against a Redis service container in CI, and locally against any Redis:
 *
 *   docker run -d --rm -p 6380:6379 redis:7-alpine
 *   REDIS_URL=redis://localhost:6380 npm run test:integration
 */

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

function get(query = '', token?: string): Request {
  return new Request(`${origin}/api/v1/channels/x/messages${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

let redis: WaveRedis

beforeAll(async () => {
  redis = await getRedis()
  await redis.ping()
}, 30_000)

afterAll(async () => {
  // The prefix is unique per run (tests/integration/setup.ts), so this reaches
  // only this run's keys and never a developer's own Redis contents.
  const prefix = process.env.REDIS_PREFIX
  for await (const batch of redis.scanIterator({ MATCH: `${prefix}:*`, COUNT: 200 })) {
    if (batch.length > 0) await redis.del(batch)
  }
  await closeRedis()
})

describe('the whole flow, against a real Redis', () => {
  it('carries two agents from create to close', async () => {
    // Create.
    const created = await (await createRoute(post({ ttl: '1h', name: 'integration' }))).json()
    const id = created.channel_id as string

    // Two joins.
    const alpha = await (
      await joinRoute(post({ name: 'Alpha', role: 'agent', client: 'claude-code' }, created.invite_token), context(id))
    ).json()
    const beta = await (
      await joinRoute(post({ name: 'Beta', role: 'agent', client: 'codex-cli' }, created.invite_token), context(id))
    ).json()

    // Alternating post and poll, each side advancing its own cursor.
    await postRoute(post({ text: 'Alpha here.' }, alpha.participant_token), context(id))
    const betaHeard = await (
      await pollRoute(get(`?after=${beta.last_seq ?? 0}&wait=1`, beta.participant_token), context(id))
    ).json()
    expect(betaHeard.items.some((item: { text?: string }) => item.text === 'Alpha here.')).toBe(true)

    await postRoute(post({ text: 'Beta here.' }, beta.participant_token), context(id))
    const alphaHeard = await (
      await pollRoute(get(`?after=${alpha.last_seq ?? 0}&wait=1`, alpha.participant_token), context(id))
    ).json()
    expect(alphaHeard.items.some((item: { text?: string }) => item.text === 'Beta here.')).toBe(true)

    // Real sorted-set ordering: seq ascending, no gaps in what we posted.
    const all = await (await pollRoute(get('?after=0', alpha.participant_token), context(id))).json()
    const seqs = all.items.map((item: { seq: number }) => item.seq)
    expect(seqs).toEqual([...seqs].sort((a: number, b: number) => a - b))

    // Done, then leave.
    await postRoute(post({ text: 'Shipping it.', kind: 'done' }, alpha.participant_token), context(id))
    expect((await leaveRoute(post({}, alpha.participant_token), context(id))).status).toBe(200)

    const farewell = await (await pollRoute(get('?after=0', beta.participant_token), context(id))).json()
    expect(farewell.items.some((item: { event?: string }) => item.event === 'participant.left')).toBe(true)

    // Close, and prove the keys are really gone from a real store.
    expect((await closeRoute(post({}, created.admin_token), context(id))).status).toBe(200)
    expect((await readRoute(get('', created.invite_token), context(id))).status).toBe(410)

    const leftovers: string[] = []
    for await (const batch of redis.scanIterator({ MATCH: `${process.env.REDIS_PREFIX}:ch:${id}*`, COUNT: 200 })) {
      leftovers.push(...batch)
    }
    expect(leftovers).toEqual([])
  }, 60_000)

  /**
   * The fake applies TTLs by storing a number. Real Redis has to be asked
   * correctly, and a key that outlives its channel is a retention bug rather
   * than an inconvenience.
   */
  it('puts a real expiry on every key a channel owns', async () => {
    const created = await (await createRoute(post({ ttl: '1h' }))).json()
    const id = created.channel_id as string
    await joinRoute(post({ name: 'Alpha', role: 'agent' }, created.invite_token), context(id))

    for await (const batch of redis.scanIterator({ MATCH: `${process.env.REDIS_PREFIX}:ch:${id}*`, COUNT: 200 })) {
      for (const key of batch) {
        const ttl = await redis.ttl(key)
        expect(ttl, `${key} has no expiry`).toBeGreaterThan(0)
        expect(ttl, `${key} outlives its channel`).toBeLessThanOrEqual(60 * 60 + 5)
      }
    }
  }, 30_000)

  /**
   * The counters are deliberately outside the `ch:` space. Close uses a
   * pattern delete, and a pattern is exactly the kind of thing that quietly
   * takes more than it meant to.
   */
  it('leaves the product counters alone when a channel is closed', async () => {
    const before = await readMetric(redis, 'channels_created', metricDay())

    const created = await (await createRoute(post({ ttl: '1h' }))).json()
    expect(await readMetric(redis, 'channels_created', metricDay())).toBe(before + 1)

    await closeRoute(post({}, created.admin_token), context(created.channel_id))

    expect(await readMetric(redis, 'channels_created', metricDay())).toBe(before + 1)
    expect(await redis.ttl(keys.metric(metricDay(), 'channels_created'))).toBeGreaterThan(60 * 60 * 24)
  }, 30_000)

  it('holds a long-poll open on a real connection and returns when someone speaks', async () => {
    const created = await (await createRoute(post({ ttl: '1h' }))).json()
    const id = created.channel_id as string
    const alpha = await (
      await joinRoute(post({ name: 'Alpha', role: 'agent' }, created.invite_token), context(id))
    ).json()
    const beta = await (
      await joinRoute(post({ name: 'Beta', role: 'agent' }, created.invite_token), context(id))
    ).json()

    const drained = await (await pollRoute(get('?after=0&wait=0', alpha.participant_token), context(id))).json()

    const started = Date.now()
    const waiting = pollRoute(get(`?after=${drained.last_seq}&wait=10`, alpha.participant_token), context(id))
    const speaking = new Promise((resolve) => setTimeout(resolve, 1_000)).then(() =>
      postRoute(post({ text: 'Finally.' }, beta.participant_token), context(id)),
    )
    const [response] = await Promise.all([waiting, speaking])
    const heard = await response.json()

    expect(heard.items.some((item: { text?: string }) => item.text === 'Finally.')).toBe(true)
    expect(Date.now() - started).toBeLessThan(9_000)
  }, 40_000)
})
