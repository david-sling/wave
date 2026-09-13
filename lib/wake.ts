import { keys } from './keys'
import type { WaveRedis } from './redis'

/**
 * Wake signals for the long-poll (ARCHITECTURE sections 3 and 10).
 *
 * A held poll used to ask Redis for the channel's sequence number once a
 * second: fifty reads for a request that usually comes back with nothing. So
 * an append publishes on the channel's wake topic instead, and every poll
 * holding that channel — in this process or any other — hears it at once.
 *
 * The signal is only ever "look again". The sequence number stays the source
 * of truth, and a poll that hears nothing still looks on a slow tick, so a
 * signal that goes missing costs a few seconds of latency and never a message.
 *
 * Pub/sub needs a connection of its own, because a subscribed client cannot
 * run ordinary commands. One duplicate of the shared client is opened on first
 * use and shared by every poll in the process. Where that is not possible — a
 * store without pub/sub, a connection that will not open — callers are handed
 * nothing and fall back to the one-second loop they had before.
 */

/** One poll's subscription. Opened before the first read, closed when the request ends. */
export type WakeHandle = {
  /** Resolves on a signal, after `ms`, or when the request is abandoned. */
  wait: (ms: number, signal: AbortSignal) => Promise<void>
  close: () => Promise<void>
}

type Listener = () => void

/** The polls in this process waiting on one topic, and whether Redis took the subscribe. */
type Topic = { listeners: Set<Listener>; ready: Promise<boolean> }

type WakeState = {
  subscriber?: Promise<WaveRedis | undefined>
  topics: Map<string, Topic>
}

const cache = globalThis as typeof globalThis & { __waveWake?: WakeState }

function state(): WakeState {
  cache.__waveWake ??= { topics: new Map() }
  return cache.__waveWake
}

/** Never the message body, and never the arguments: only that pub/sub is not working. */
function report(what: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  console.error(`redis(wake): ${what}: ${detail}`)
}

/**
 * The process's subscriber connection, opened once.
 *
 * A store that cannot duplicate its client — the in-memory fake the unit tests
 * run against — resolves to undefined and is cached as such: asking again
 * every poll would be a pointless branch. A connection that fails to open
 * clears the cache, so the next request tries again rather than being stuck
 * with a blip forever.
 */
async function subscriber(redis: WaveRedis): Promise<WaveRedis | undefined> {
  const current = state()
  current.subscriber ??= (async () => {
    if (typeof (redis as Partial<WaveRedis>).duplicate !== 'function') return undefined
    const client = redis.duplicate()
    client.on('error', (error: Error) => report('connection', error))
    await client.connect()
    return client
  })().catch((error: unknown) => {
    current.subscriber = undefined
    report('unavailable', error)
    return undefined
  })
  return current.subscriber
}

/** Adds one poll to a topic, subscribing if it is the first. Answers whether it is really subscribed. */
async function listen(redis: WaveRedis, topic: string, listener: Listener): Promise<boolean> {
  const client = await subscriber(redis)
  if (!client) return false

  const { topics } = state()
  let entry = topics.get(topic)
  if (!entry) {
    const listeners = new Set<Listener>()
    const ready = client
      // A copy, because a listener that ends its own poll may leave the set mid-loop.
      .subscribe(topic, () => {
        for (const waiting of [...listeners]) waiting()
      })
      .then(() => true)
      .catch((error: unknown) => {
        topics.delete(topic)
        report('subscribe', error)
        return false
      })
    entry = { listeners, ready }
    topics.set(topic, entry)
  }
  entry.listeners.add(listener)
  return entry.ready
}

/** Drops one poll from a topic, unsubscribing when the last one goes. */
async function release(redis: WaveRedis, topic: string, listener: Listener): Promise<void> {
  const { topics } = state()
  const entry = topics.get(topic)
  if (!entry) return

  entry.listeners.delete(listener)
  if (entry.listeners.size > 0) return
  topics.delete(topic)

  const client = await subscriber(redis)
  // A failed unsubscribe is not worth failing a request that has already answered.
  await client?.unsubscribe(topic).catch((error: unknown) => report('unsubscribe', error))
}

/**
 * Subscribes for the life of one poll, or returns undefined when this store
 * has no pub/sub to offer.
 *
 * Open it before the first read of the sequence number, never after: a message
 * that lands in between would otherwise signal an empty room and the poll
 * would hold to its deadline with the answer already sitting in Redis. The
 * handle remembers a signal that arrives while nothing is waiting, so the next
 * wait returns straight away.
 */
export async function openWake(redis: WaveRedis, channelId: string): Promise<WakeHandle | undefined> {
  const topic = keys.wake(channelId)
  let signalled = false
  let wakeNow: Listener | undefined
  const listener: Listener = () => {
    signalled = true
    wakeNow?.()
  }

  if (!(await listen(redis, topic, listener))) return undefined

  return {
    async wait(ms: number, signal: AbortSignal): Promise<void> {
      // Consumed either way: the caller reads the sequence number on return,
      // which is the whole of what a signal asks for.
      if (signalled || signal.aborted) {
        signalled = false
        return
      }
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer)
          signal.removeEventListener('abort', finish)
          wakeNow = undefined
          signalled = false
          resolve()
        }
        const timer = setTimeout(finish, ms)
        wakeNow = finish
        signal.addEventListener('abort', finish, { once: true })
      })
    },
    async close(): Promise<void> {
      await release(redis, topic, listener)
    },
  }
}

/**
 * Tells everyone holding this channel that there is something new.
 *
 * Called after the item is written, so a poll woken by it finds the item and
 * not just the number. Nothing here may fail a post: a message that reached
 * Redis is delivered whether or not the signal went out, a second later on the
 * safety tick instead of at once.
 */
export async function publishWake(redis: WaveRedis, channelId: string, seq: number): Promise<void> {
  if (typeof (redis as Partial<WaveRedis>).publish !== 'function') return
  try {
    await redis.publish(keys.wake(channelId), String(seq))
  } catch (error: unknown) {
    report('publish', error)
  }
}

/** Drops the subscriber. For tests and for graceful shutdown. */
export async function closeWake(): Promise<void> {
  const current = cache.__waveWake
  cache.__waveWake = undefined
  if (!current?.subscriber) return
  const client = await current.subscriber.catch(() => undefined)
  await client?.close().catch(() => undefined)
}
