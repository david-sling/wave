import { createClient } from 'redis'
import { getConfig } from './config'
import { channelKeys, keys } from './keys'
import { closeWake } from './wake'

/**
 * The Redis connection (ARCHITECTURE sections 2 and 4).
 *
 * One client per process, created on first use and reused across invocations,
 * which is what Fluid Compute gives us. TTLs, INCR, sorted sets, and pub/sub
 * are the whole of it, so any Redis 6 or later works. An instance whose store
 * has no pub/sub still works: the long-poll falls back to reading (lib/wake.ts).
 */

function createWaveClient(url: string) {
  return createClient({
    url,
    socket: {
      // Back off to a ceiling rather than giving up: a long-poll outlives a blip.
      reconnectStrategy: (retries: number) => Math.min(50 * 2 ** retries, 2_000),
    },
  })
}

export type WaveRedis = ReturnType<typeof createWaveClient>

const cache = globalThis as typeof globalThis & { __waveRedis?: Promise<WaveRedis> }

async function connect(): Promise<WaveRedis> {
  const client = createWaveClient(getConfig().redisUrl)
  // Never log command arguments: message bodies must not reach the logs.
  client.on('error', (error: Error) => console.error(`redis: ${error.name}: ${error.message}`))
  await client.connect()
  return client
}

/** The shared client. Connects on first call. */
export function getRedis(): Promise<WaveRedis> {
  cache.__waveRedis ??= connect().catch((error: unknown) => {
    // A failed connect must not poison every later request.
    cache.__waveRedis = undefined
    throw error
  })
  return cache.__waveRedis
}

/** Drops the shared client. For tests and for graceful shutdown. */
export async function closeRedis(): Promise<void> {
  const pending = cache.__waveRedis
  cache.__waveRedis = undefined
  // The subscriber is a duplicate of this client and has no life of its own.
  await closeWake()
  if (!pending) return
  const client = await pending.catch(() => undefined)
  await client?.close()
}

/**
 * Sets EXPIREAT on every key a channel owns. Call after any write: retention is
 * the TTL, so a key that outlives its channel is a data-retention bug, not an
 * inconvenience. Keys that do not exist yet are skipped by Redis.
 */
export async function applyChannelTtl(
  client: WaveRedis,
  channelId: string,
  expiresAt: number,
  extraKeys: string[] = [],
): Promise<void> {
  const multi = client.multi()
  for (const key of [...channelKeys(channelId), ...extraKeys]) multi.expireAt(key, expiresAt)
  await multi.exec()
}

/** Adds the channel to the sweep's work list, scored by expiry (ARCHITECTURE section 5). */
export async function registerActiveChannel(
  client: WaveRedis,
  channelId: string,
  expiresAt: number,
): Promise<void> {
  await client.zAdd(keys.activeChannels(), { score: expiresAt, value: channelId })
}

/** Removes a closed or expired channel from the sweep's work list. */
export async function forgetActiveChannel(client: WaveRedis, channelId: string): Promise<void> {
  await client.zRem(keys.activeChannels(), channelId)
}
