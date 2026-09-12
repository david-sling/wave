import { beforeEach, describe, expect, it } from 'vitest'
import { fakeRedis, type FakeRedis } from '../tests/fake-redis'
import { createChannel, createChannelRequestSchema, listParticipants } from './channels'
import { keys } from './keys'
import { joinDelayBucket, METRICS_RETENTION_DAYS, metricDay, normaliseClient, readMetric } from './metrics'
import { joinChannel, joinRequestSchema } from './participants'
import { postMessage, postMessageRequestSchema } from './messages'
import type { WaveRedis } from './redis'
import { loadChannel } from './auth'

/**
 * The counts in PRODUCT section 14, and the promise that comes with them.
 *
 * Two properties matter as much as the arithmetic: a counter must never be
 * traceable to a channel, and a counter must never break a request.
 */

let fake: FakeRedis
let redis: WaveRedis

beforeEach(() => {
  ;({ fake, redis } = fakeRedis())
})

async function openChannel() {
  const created = await createChannel(redis, createChannelRequestSchema.parse({ ttl: '1h' }))
  const channel = await loadChannel(redis, created.channel_id)
  return { created, channel }
}

async function join(channelId: string, name: string, client?: string, role: 'agent' | 'human' = 'agent') {
  const channel = await loadChannel(redis, channelId)
  return joinChannel(redis, channel, joinRequestSchema.parse({ name, role, ...(client ? { client } : {}) }))
}

describe('normaliseClient', () => {
  it('keeps the products we expect', () => {
    expect(normaliseClient('claude-code')).toBe('claude-code')
    expect(normaliseClient('Codex CLI')).toBe('codex-cli')
  })

  it('folds a version suffix into its product', () => {
    expect(normaliseClient('claude-code-2.1.232')).toBe('claude-code')
  })

  it('says unknown when an agent reported nothing', () => {
    expect(normaliseClient(undefined)).toBe('unknown')
  })

  /**
   * `client` is free text from a stranger. If it became a key of its own, a
   * few thousand joins could fill the store with junk keys.
   */
  it('refuses to turn arbitrary text into a key of its own', () => {
    expect(normaliseClient('totally-made-up-agent')).toBe('other')
    expect(normaliseClient('x'.repeat(120))).toBe('other')
  })
})

describe('joinDelayBucket', () => {
  it('buckets rather than recording the duration itself', () => {
    expect(joinDelayBucket(5)).toBe('under-30s')
    expect(joinDelayBucket(45)).toBe('under-60s')
    expect(joinDelayBucket(50_000)).toBe('over-6h')
  })
})

describe('what gets counted', () => {
  it('counts a channel when it is created', async () => {
    await openChannel()
    await openChannel()
    expect(await readMetric(redis, 'channels_created')).toBe(2)
  })

  it('counts the channel once when its second agent arrives, not on every join', async () => {
    const { created } = await openChannel()
    await join(created.channel_id, 'Alpha')
    expect(await readMetric(redis, 'channels_two_agents')).toBe(0)

    await join(created.channel_id, 'Beta')
    expect(await readMetric(redis, 'channels_two_agents')).toBe(1)

    await join(created.channel_id, 'Gamma')
    expect(await readMetric(redis, 'channels_two_agents')).toBe(1)
  })

  it('does not let a human count towards the two-agent mark', async () => {
    const { created } = await openChannel()
    await join(created.channel_id, 'Alpha')
    await join(created.channel_id, 'A person', undefined, 'human')
    expect(await readMetric(redis, 'channels_two_agents')).toBe(0)
  })

  it('records how long the second agent took, as a bucket', async () => {
    const { created } = await openChannel()
    await join(created.channel_id, 'Alpha')
    await join(created.channel_id, 'Beta')
    expect(await readMetric(redis, 'second_join:under-30s')).toBe(1)
  })

  it('counts each agent product that joins', async () => {
    const { created } = await openChannel()
    await join(created.channel_id, 'Alpha', 'claude-code')
    await join(created.channel_id, 'Beta', 'codex-cli')
    await join(created.channel_id, 'Gamma', 'claude-code')

    expect(await readMetric(redis, 'client:claude-code')).toBe(2)
    expect(await readMetric(redis, 'client:codex-cli')).toBe(1)
  })

  it('counts an exchange only when a second, different agent speaks', async () => {
    const { created, channel } = await openChannel()
    const alpha = await join(created.channel_id, 'Alpha')
    const beta = await join(created.channel_id, 'Beta')
    const alphaRecord = await participant(created.channel_id, alpha.participant_id)
    const betaRecord = await participant(created.channel_id, beta.participant_id)

    await postMessage(redis, channel, alphaRecord, postMessageRequestSchema.parse({ text: 'one', kind: 'message' }))
    expect(await readMetric(redis, 'channels_exchanged')).toBe(0)

    await postMessage(redis, channel, alphaRecord, postMessageRequestSchema.parse({ text: 'still me', kind: 'message' }))
    expect(await readMetric(redis, 'channels_exchanged')).toBe(0)

    await postMessage(redis, channel, betaRecord, postMessageRequestSchema.parse({ text: 'and me', kind: 'message' }))
    expect(await readMetric(redis, 'channels_exchanged')).toBe(1)

    await postMessage(redis, channel, alphaRecord, postMessageRequestSchema.parse({ text: 'again', kind: 'message' }))
    expect(await readMetric(redis, 'channels_exchanged')).toBe(1)
  })

  it('counts a finished channel once, however many agents say done', async () => {
    const { created, channel } = await openChannel()
    const alpha = await join(created.channel_id, 'Alpha')
    const beta = await join(created.channel_id, 'Beta')

    await postMessage(redis, channel, await participant(created.channel_id, alpha.participant_id), postMessageRequestSchema.parse({ text: 'done here', kind: 'done' }))
    await postMessage(redis, channel, await participant(created.channel_id, beta.participant_id), postMessageRequestSchema.parse({ text: 'and here', kind: 'done' }))

    expect(await readMetric(redis, 'channels_done')).toBe(1)
  })
})

describe('the privacy promise', () => {
  it('writes no channel or participant identifier into any metric key', async () => {
    const { created, channel } = await openChannel()
    const alpha = await join(created.channel_id, 'Alpha', 'claude-code')
    await postMessage(redis, channel, await participant(created.channel_id, alpha.participant_id), postMessageRequestSchema.parse({ text: 'hello', kind: 'message' }))

    const metricKeys = fake.keys().filter((key) => key.includes(`:m:${metricDay()}:`))
    expect(metricKeys.length).toBeGreaterThan(0)
    for (const key of metricKeys) {
      expect(key).not.toContain(created.channel_id)
      expect(key).not.toContain(alpha.participant_id)
      expect(key.toLowerCase()).not.toContain('alpha')
    }
  })

  it('keeps aggregates alive far longer than any channel', async () => {
    await openChannel()
    const key = keys.metric(metricDay(), 'channels_created')
    const ttl = await redis.ttl(key)
    expect(ttl).toBeGreaterThan(60 * 60 * 24 * (METRICS_RETENTION_DAYS - 1))
  })

  /**
   * The markers that stop a channel being counted twice DO identify a channel,
   * so they live in the channel's own keys and die with it.
   */
  it('keeps the once-only markers inside the channel, where expiry reaches them', async () => {
    const { created, channel } = await openChannel()
    const alpha = await join(created.channel_id, 'Alpha')
    const beta = await join(created.channel_id, 'Beta')
    await postMessage(redis, channel, await participant(created.channel_id, alpha.participant_id), postMessageRequestSchema.parse({ text: 'one', kind: 'message' }))
    await postMessage(redis, channel, await participant(created.channel_id, beta.participant_id), postMessageRequestSchema.parse({ text: 'two', kind: 'message' }))

    for (const key of [keys.emitted(created.channel_id), keys.firstPoster(created.channel_id)]) {
      expect(fake.ttlOf(key)).toBeDefined()
    }
  })
})

describe('a counter never breaks a request', () => {
  it('posts the message even when the counter store refuses', async () => {
    const { created, channel } = await openChannel()
    const alpha = await join(created.channel_id, 'Alpha')
    const record = await participant(created.channel_id, alpha.participant_id)

    // Fails only the counter write. Breaking `incr` outright would break the
    // sequence allocator too, and then the test would prove nothing.
    const broken = new Proxy(redis, {
      get(target, property, receiver) {
        if (property === 'incr') {
          return async (key: string) =>
            key.includes(':m:')
              ? Promise.reject(new Error('the counter store is having a day'))
              : target.incr(key)
        }
        return Reflect.get(target, property, receiver)
      },
    }) as WaveRedis

    const posted = await postMessage(broken, channel, record, postMessageRequestSchema.parse({ text: 'still gets through', kind: 'message' }))
    expect(posted.seq).toBeGreaterThan(0)
  })
})

async function participant(channelId: string, participantId: string) {
  const all = await listParticipants(redis, channelId)
  return all.find((p) => p.id === participantId)!
}
