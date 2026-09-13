import { keys } from './keys'
import type { WaveRedis } from './redis'

/**
 * Wake signals for the long-poll (ARCHITECTURE section 3).
 *
 * An append publishes on the channel's wake topic and every poll holding that
 * channel hears it at once, in any process. The signal is only ever "look
 * again": the sequence number stays the source of truth, so a signal that goes
 * missing costs latency and never a message.
 *
 * The subscriber is a duplicate of the shared client, one per process. A store
 * without pub/sub hands callers nothing and they fall back to reading.
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

/** Never the message body or the arguments: only that pub/sub is not working. */
function report(what: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  console.error(`redis(wake): ${what}: ${detail}`)
}

/**
 * One command a minute, for the whole process. Keeps a managed store or an idle
 * proxy from closing a connection that carries no traffic, and turns one that
 * has quietly died into a reconnect rather than a silence.
 */
const PING_INTERVAL_MS = 60_000

/**
 * The process's subscriber connection, opened once. A store that cannot
 * duplicate its client caches undefined; a connection that fails to open
 * clears the cache so the next request tries again.
 *
 * Coming back from a reconnect wakes every poll: pub/sub is fire and forget,
 * so whatever was published while the socket was away is gone, and being told
 * to look again is the only way a poll finds out.
 */
async function subscriber(redis: WaveRedis): Promise<WaveRedis | undefined> {
  const current = state()
  current.subscriber ??= (async () => {
    if (typeof (redis as Partial<WaveRedis>).duplicate !== 'function') return undefined
    const client = redis.duplicate({ pingInterval: PING_INTERVAL_MS })
    client.on('error', (error: Error) => report('connection', error))
    client.on('ready', () => wakeEveryone(current))
    await client.connect()
    return client
  })().catch((error: unknown) => {
    current.subscriber = undefined
    report('unavailable', error)
    return undefined
  })
  return current.subscriber
}

/** Tells every poll in this process to look again, whatever channel it is holding. */
function wakeEveryone(current: WakeState): void {
  for (const topic of current.topics.values()) {
    for (const waiting of [...topic.listeners]) waiting()
  }
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
      // A copy: a listener that ends its own poll leaves the set mid-loop.
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
 * Subscribes for the life of one poll, or returns undefined where the store has
 * no pub/sub. Open it before the first read of the sequence number, never
 * after: the handle remembers a signal that arrives while nothing is waiting,
 * which is what stops a message landing in that gap from being missed.
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
      // Consumed either way: the caller reads the sequence number on return.
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
 * Tells everyone holding this channel that there is something new. Call it
 * after the item is written, so a woken poll finds the item and not just the
 * number. Never fails a post: without the signal the tick still finds it.
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
