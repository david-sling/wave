import { afterEach, describe, expect, it } from 'vitest'
import { keys } from './keys'
import type { WaveRedis } from './redis'
import { closeWake, openWake, publishWake } from './wake'

/**
 * The wake signal (lib/wake.ts). A fake bus stands in for Redis pub/sub: the
 * unit suite's ordinary fake has none, which is itself one of the cases here.
 */

type Listener = (message: string, topic: string) => void

/** One process's view of the pub/sub side of a Redis, shared by a client and its duplicates. */
class FakeBus {
  readonly topics = new Map<string, Set<Listener>>()
  readonly subscribed: string[] = []
  readonly unsubscribed: string[] = []
  duplicates = 0
  closed = 0
  /** Set to fail the next subscribe, as a store that does not allow it would. */
  refuseSubscribe = false
}

class FakePubSub {
  constructor(readonly bus: FakeBus) {}

  duplicate(): FakePubSub {
    this.bus.duplicates += 1
    return new FakePubSub(this.bus)
  }

  async connect(): Promise<void> {}
  on(): void {}

  async subscribe(topic: string, listener: Listener): Promise<void> {
    if (this.bus.refuseSubscribe) throw new Error('subscribe is not allowed here')
    this.bus.subscribed.push(topic)
    const listeners = this.bus.topics.get(topic) ?? new Set<Listener>()
    listeners.add(listener)
    this.bus.topics.set(topic, listeners)
  }

  async unsubscribe(topic: string): Promise<void> {
    this.bus.unsubscribed.push(topic)
    this.bus.topics.delete(topic)
  }

  async publish(topic: string, message: string): Promise<number> {
    const listeners = [...(this.bus.topics.get(topic) ?? [])]
    // Delivered off the stack, as a real subscriber's message would be.
    for (const listener of listeners) queueMicrotask(() => listener(message, topic))
    return listeners.length
  }

  async close(): Promise<void> {
    this.bus.closed += 1
  }
}

function fakeBus(): { bus: FakeBus; redis: WaveRedis } {
  const bus = new FakeBus()
  return { bus, redis: new FakePubSub(bus) as unknown as WaveRedis }
}

/** A store with no pub/sub at all, like the one every other unit test uses. */
function withoutPubSub(): WaveRedis {
  return {} as unknown as WaveRedis
}

const never = new AbortController().signal

afterEach(async () => {
  await closeWake()
})

describe('openWake', () => {
  it('hands back nothing when the store has no pub/sub, so the caller can fall back', async () => {
    expect(await openWake(withoutPubSub(), 'abc')).toBeUndefined()
  })

  it('hands back nothing when the store refuses the subscribe', async () => {
    const { bus, redis } = fakeBus()
    bus.refuseSubscribe = true
    expect(await openWake(redis, 'abc')).toBeUndefined()
  })

  it('wakes a waiting poll when something is published', async () => {
    const { redis } = fakeBus()
    const wake = await openWake(redis, 'abc')
    const started = Date.now()

    const waiting = wake!.wait(5_000, never)
    await publishWake(redis, 'abc', 7)
    await waiting

    expect(Date.now() - started).toBeLessThan(1_000)
    await wake!.close()
  })

  it('remembers a signal that arrives while nothing is waiting', async () => {
    const { redis } = fakeBus()
    const wake = await openWake(redis, 'abc')

    // Between the read and the wait: the case the subscription is opened early for.
    await publishWake(redis, 'abc', 1)
    await new Promise((resolve) => setTimeout(resolve, 10))

    const started = Date.now()
    await wake!.wait(5_000, never)
    expect(Date.now() - started).toBeLessThan(1_000)

    await wake!.close()
  })

  it('consumes a remembered signal once, then waits again', async () => {
    const { redis } = fakeBus()
    const wake = await openWake(redis, 'abc')

    await publishWake(redis, 'abc', 1)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await wake!.wait(5_000, never)

    const started = Date.now()
    await wake!.wait(60, never)
    expect(Date.now() - started).toBeGreaterThanOrEqual(50)

    await wake!.close()
  })

  it('returns on the tick when nobody says anything', async () => {
    const { redis } = fakeBus()
    const wake = await openWake(redis, 'abc')
    const started = Date.now()

    await wake!.wait(60, never)

    expect(Date.now() - started).toBeGreaterThanOrEqual(50)
    await wake!.close()
  })

  it('returns when the request is abandoned', async () => {
    const { redis } = fakeBus()
    const wake = await openWake(redis, 'abc')
    const controller = new AbortController()

    const waiting = wake!.wait(5_000, controller.signal)
    controller.abort()
    await waiting

    await wake!.close()
  })

  it('subscribes once for a channel however many polls hold it, and wakes them all', async () => {
    const { bus, redis } = fakeBus()
    const first = await openWake(redis, 'abc')
    const second = await openWake(redis, 'abc')
    expect(bus.subscribed).toEqual([keys.wake('abc')])

    const waiting = Promise.all([first!.wait(5_000, never), second!.wait(5_000, never)])
    await publishWake(redis, 'abc', 3)
    await waiting

    // And one connection for the process, not one per poll.
    expect(bus.duplicates).toBe(1)
  })

  it('unsubscribes only when the last poll on the channel has gone', async () => {
    const { bus, redis } = fakeBus()
    const first = await openWake(redis, 'abc')
    const second = await openWake(redis, 'abc')

    await first!.close()
    expect(bus.unsubscribed).toEqual([])

    await second!.close()
    expect(bus.unsubscribed).toEqual([keys.wake('abc')])
  })

  it('keeps one channel out of another channel by using its own topic', async () => {
    const { bus, redis } = fakeBus()
    const here = await openWake(redis, 'abc')
    await openWake(redis, 'xyz')

    const started = Date.now()
    await publishWake(redis, 'xyz', 1)
    await here!.wait(60, never)

    expect(Date.now() - started).toBeGreaterThanOrEqual(50)
    expect(bus.subscribed).toEqual([keys.wake('abc'), keys.wake('xyz')])
  })
})

describe('publishWake', () => {
  it('says nothing to a store that cannot publish', async () => {
    await expect(publishWake(withoutPubSub(), 'abc', 1)).resolves.toBeUndefined()
  })

  it('swallows a failure, because a written message is delivered either way', async () => {
    const broken = {
      publish: async () => {
        throw new Error('no')
      },
    } as unknown as WaveRedis
    await expect(publishWake(broken, 'abc', 1)).resolves.toBeUndefined()
  })
})
