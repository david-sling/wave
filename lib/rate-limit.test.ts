import { describe, expect, it } from 'vitest'
import { fakeRedis } from '../tests/fake-redis'
import { ApiError } from './http'
import { keys } from './keys'
import { callerAddress, enforceLimit, limitChannelCreation, withConcurrencyLimit } from './rate-limit'

const limit = { scope: 'test', subject: '203.0.113.7', max: 3, windowSeconds: 60 }

describe('enforceLimit', () => {
  it('allows up to the limit and then refuses', async () => {
    const { redis } = fakeRedis()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(enforceLimit(redis, limit)).resolves.toBeUndefined()
    }
    await expect(enforceLimit(redis, limit)).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
  })

  it('says when to come back', async () => {
    const { redis } = fakeRedis()
    for (let attempt = 0; attempt < 3; attempt += 1) await enforceLimit(redis, limit)

    const error = (await enforceLimit(redis, limit).catch((e: unknown) => e)) as ApiError
    expect(Number(error.headers?.['Retry-After'])).toBeGreaterThan(0)
    expect(Number(error.headers?.['Retry-After'])).toBeLessThanOrEqual(60)
  })

  it('counts each subject separately', async () => {
    const { redis } = fakeRedis()
    for (let attempt = 0; attempt < 3; attempt += 1) await enforceLimit(redis, limit)
    await expect(enforceLimit(redis, { ...limit, subject: '198.51.100.9' })).resolves.toBeUndefined()
  })

  it('stores a hash, never the subject', async () => {
    const { fake, redis } = fakeRedis()
    await enforceLimit(redis, limit)
    const [key] = fake.keys().filter((stored: string) => stored.startsWith('wave:rl:'))
    expect(key).not.toContain('203.0.113.7')
    expect(key).toMatch(/^wave:rl:test:[0-9a-f]{32}$/)
  })

  it('gives the counter a TTL so the window really ends', async () => {
    const { fake, redis } = fakeRedis()
    await enforceLimit(redis, limit)
    const [key] = fake.keys().filter((stored: string) => stored.startsWith('wave:rl:'))
    expect(fake.ttlOf(key)).toBeGreaterThan(0)
  })
})

describe('withConcurrencyLimit', () => {
  /** Starts a holder and waits until it has actually taken its slot. */
  async function startHolder(redis: Parameters<typeof withConcurrencyLimit>[0], gate: Promise<void>) {
    let acquired = () => {}
    const inside = new Promise<void>((resolve) => {
      acquired = resolve
    })
    const finished = withConcurrencyLimit(redis, 'p_1', 2, async () => {
      acquired()
      await gate
      return 'done'
    })
    await inside
    // Wrapped, because returning the promise itself would make this helper
    // await the very work it is only supposed to start.
    return { finished }
  }

  it('allows the slots it has and refuses the next', async () => {
    const { redis } = fakeRedis()
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const { finished: first } = await startHolder(redis, gate)
    const { finished: second } = await startHolder(redis, gate)

    await expect(
      withConcurrencyLimit(redis, 'p_1', 2, async () => 'should not run'),
    ).rejects.toMatchObject({ status: 429, code: 'rate_limited' })

    release()
    await expect(Promise.all([first, second])).resolves.toEqual(['done', 'done'])

    // With the slots given back, the next caller is welcome again.
    await expect(withConcurrencyLimit(redis, 'p_1', 2, async () => 'ok')).resolves.toBe('ok')
  })

  it('frees the slot once the work is done, even when it throws', async () => {
    const { redis } = fakeRedis()
    await expect(
      withConcurrencyLimit(redis, 'p_2', 1, async () => {
        throw new Error('poll blew up')
      }),
    ).rejects.toThrow('poll blew up')

    await expect(withConcurrencyLimit(redis, 'p_2', 1, async () => 'ok')).resolves.toBe('ok')
  })

  it('leaves a TTL on the slot, so a killed request cannot hold it forever', async () => {
    const { fake, redis } = fakeRedis()
    await withConcurrencyLimit(redis, 'p_3', 1, async () => 'ok')
    const [key] = fake.keys().filter((stored: string) => stored.includes(':rl:concurrent:'))
    expect(fake.ttlOf(key)).toBeGreaterThan(0)
  })
})

describe('callerAddress', () => {
  it('takes the first hop of X-Forwarded-For', () => {
    const request = new Request('https://wave.example.com/', {
      headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' },
    })
    expect(callerAddress(request)).toBe('203.0.113.7')
  })

  it('falls back, and never throws for a request with no address at all', () => {
    expect(callerAddress(new Request('https://wave.example.com/', { headers: { 'x-real-ip': '198.51.100.9' } }))).toBe(
      '198.51.100.9',
    )
    expect(callerAddress(new Request('https://wave.example.com/'))).toBe('unknown')
  })
})

describe('channel creation limit', () => {
  it('holds a whole hour of creations from one address', async () => {
    const { redis } = fakeRedis()
    const request = new Request('https://wave.example.com/', { headers: { 'x-forwarded-for': '203.0.113.7' } })
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(limitChannelCreation(redis, request)).resolves.toBeUndefined()
    }
    await expect(limitChannelCreation(redis, request)).rejects.toMatchObject({ status: 429 })
  })
})
