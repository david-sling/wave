import { createClient } from 'redis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeRedis, getRedis, type WaveRedis } from '@/lib/redis'

/**
 * What a held poll actually costs, counted at the server.
 *
 * The behaviour tests cannot tell a pub/sub wake-up from the one-second loop
 * it replaced: both deliver a message within a second, which is the point.
 * The difference is the number of reads a silent channel pays for, and that
 * is only visible in Redis's own command counters. So this file holds a poll
 * open and asks Redis what it was asked to do.
 *
 * Runs against a Redis service container in CI, and locally against any Redis:
 *
 *   docker run -d --rm -p 6380:6379 redis:7-alpine
 *   REDIS_URL=redis://localhost:6380 npm run test:integration
 */

const { POST: createRoute } = await import('@/app/api/v1/channels/route')
const { POST: joinRoute } = await import('@/app/api/v1/channels/[id]/join/route')
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
let probe: ReturnType<typeof createClient>

/** How many times the server has been asked to run one command since the last reset. */
async function calls(command: string): Promise<number> {
  const info = await probe.info('commandstats')
  const found = new RegExp(`^cmdstat_${command}:calls=(\\d+)`, 'm').exec(info)
  return found ? Number(found[1]) : 0
}

async function resetCounts(): Promise<void> {
  await probe.sendCommand(['CONFIG', 'RESETSTAT'])
}

/** A channel with one agent in it, drained to its current sequence number. */
async function openChannel(): Promise<{ id: string; invite: string; token: string; lastSeq: number }> {
  const created = await (await createRoute(post({ ttl: '1h', name: 'wake' }))).json()
  const id = created.channel_id as string
  const agent = await (
    await joinRoute(post({ name: 'Alpha', role: 'agent' }, created.invite_token), context(id))
  ).json()
  const token = agent.participant_token as string
  const drained = await (await pollRoute(get('?after=0&wait=0', token), context(id))).json()
  return { id, invite: created.invite_token as string, token, lastSeq: drained.last_seq }
}

beforeAll(async () => {
  redis = await getRedis()
  await redis.ping()
  probe = createClient({ url: process.env.REDIS_URL })
  await probe.connect()
}, 30_000)

afterAll(async () => {
  const prefix = process.env.REDIS_PREFIX
  for await (const batch of redis.scanIterator({ MATCH: `${prefix}:*`, COUNT: 200 })) {
    if (batch.length > 0) await redis.del(batch)
  }
  await closeRedis()
  await probe.close()
})

describe('what a held poll costs', () => {
  it('waits on a signal instead of reading the sequence number once a second', async () => {
    const { id, token, lastSeq } = await openChannel()

    // One short hold first, so opening the subscriber connection is not counted.
    await pollRoute(get(`?after=${lastSeq}&wait=1`, token), context(id))
    await resetCounts()

    const started = Date.now()
    await pollRoute(get(`?after=${lastSeq}&wait=6`, token), context(id))
    const held = Date.now() - started

    expect(held).toBeGreaterThanOrEqual(5_500)
    // The loop it replaced read once a second: seven reads for this request.
    // Subscribed, it reads to open and once more to answer, whatever the hold.
    expect(await calls('get')).toBeLessThanOrEqual(2)
    expect(await calls('subscribe')).toBe(1)
    // And lets the subscription go, so a long-lived process does not hoard them.
    expect(await calls('unsubscribe')).toBe(1)
  }, 30_000)

  it('hears a message through the signal, not on the next tick', async () => {
    const { id, invite, token } = await openChannel()
    const other = await (
      await joinRoute(post({ name: 'Beta', role: 'agent' }, invite), context(id))
    ).json()
    // After the join, not before: joining writes an event of its own, and a
    // poll started behind it would come back with that instead of the message.
    const drained = await (await pollRoute(get('?after=0&wait=0', token), context(id))).json()

    await resetCounts()
    const started = Date.now()
    const waiting = pollRoute(get(`?after=${drained.last_seq}&wait=30`, token), context(id))
    const speaking = new Promise((resolve) => setTimeout(resolve, 500)).then(() =>
      postRoute(post({ text: 'Heard me?' }, other.participant_token), context(id)),
    )
    const [response] = await Promise.all([waiting, speaking])
    const heard = await response.json()

    // Well inside the tick that would have found it anyway: this is the signal.
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(heard.items.some((item: { text?: string }) => item.text === 'Heard me?')).toBe(true)
    expect(await calls('publish')).toBeGreaterThanOrEqual(1)
  }, 40_000)
})
