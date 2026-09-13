import { beforeEach, describe, expect, it } from 'vitest'
import { fakeRedis, FakeRedis } from '../tests/fake-redis'
import { keys } from './keys'
import { applyChannelTtl, closeRedis, type WaveRedis } from './redis'

/**
 * Channel expiry (ARCHITECTURE section 4). Retention is the TTL, so the script
 * and the fallback are both checked to leave the same thing behind.
 */

const CHANNEL = 'abcdefghijklmnopqrstuv'

beforeEach(async () => {
  // The refusal is remembered per process; each test starts without it.
  await closeRedis()
})

function expiriesOf(fake: FakeRedis, channelId: string): Array<number | undefined> {
  return [keys.channel(channelId), keys.seq(channelId), keys.items(channelId), keys.parts(channelId)].map((key) =>
    fake.ttlOf(key),
  )
}

/** Every key has to exist before an expiry can land on it. */
async function seed(redis: WaveRedis, channelId: string): Promise<void> {
  await redis.hSet(keys.channel(channelId), { name: 'x' })
  await redis.set(keys.seq(channelId), '1')
  await redis.zAdd(keys.items(channelId), { score: 1, value: 'x' })
  await redis.hSet(keys.parts(channelId), { p: 'x' })
}

describe('applyChannelTtl', () => {
  it('stamps the expiry on every key the channel owns', async () => {
    const { fake, redis } = fakeRedis()
    await seed(redis, CHANNEL)

    await applyChannelTtl(redis, CHANNEL, 1_800_000_000)

    expect(expiriesOf(fake, CHANNEL)).toEqual([1_800_000_000, 1_800_000_000, 1_800_000_000, 1_800_000_000])
  })

  it('takes keys it is handed as well as the ones it knows', async () => {
    const { fake, redis } = fakeRedis()
    const idem = keys.idem(CHANNEL, 'p_1', 'client-1')
    await redis.set(idem, 'stored')

    await applyChannelTtl(redis, CHANNEL, 1_800_000_000, [idem])

    expect(fake.ttlOf(idem)).toBe(1_800_000_000)
  })

  it('still sets every expiry on a store that will not run the script', async () => {
    const { fake, redis } = fakeRedis()
    await seed(redis, CHANNEL)
    // A store with scripting turned off, which some managed plans are.
    ;(redis as unknown as { eval: () => Promise<never> }).eval = () => {
      throw new Error('ERR unknown command EVAL')
    }

    await applyChannelTtl(redis, CHANNEL, 1_800_000_000)

    expect(expiriesOf(fake, CHANNEL)).toEqual([1_800_000_000, 1_800_000_000, 1_800_000_000, 1_800_000_000])
  })

  it('stops asking a store that has already refused once', async () => {
    const { fake, redis } = fakeRedis()
    await seed(redis, CHANNEL)
    let asked = 0
    ;(redis as unknown as { eval: () => Promise<never> }).eval = () => {
      asked += 1
      throw new Error('ERR unknown command EVAL')
    }

    await applyChannelTtl(redis, CHANNEL, 1_800_000_000)
    await applyChannelTtl(redis, CHANNEL, 1_900_000_000)

    expect(asked).toBe(1)
    expect(expiriesOf(fake, CHANNEL)).toEqual([1_900_000_000, 1_900_000_000, 1_900_000_000, 1_900_000_000])
  })
})
