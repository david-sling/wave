import { getConfig } from './config'

/**
 * The key layout from ARCHITECTURE section 4. Every channel key is prefixed
 * with the channel ID, so isolation between channels is structural: there is
 * no query that can reach across one without being handed the other's ID.
 *
 * In front of that sits the instance namespace (REDIS_PREFIX, default `wave`),
 * so one Redis can host this app beside others without any chance of two of
 * them reaching for the same key.
 */

function ns(): string {
  return getConfig().redisPrefix
}

export const keys = {
  /** hash: the channel record */
  channel: (channelId: string) => `${ns()}:ch:${channelId}`,
  /** string: last allocated sequence number */
  seq: (channelId: string) => `${ns()}:ch:${channelId}:seq`,
  /** sorted set: one JSON item per member, score = seq */
  items: (channelId: string) => `${ns()}:ch:${channelId}:items`,
  /** string: running total of item bytes */
  bytes: (channelId: string) => `${ns()}:ch:${channelId}:bytes`,
  /** hash: participant_id -> JSON participant record */
  parts: (channelId: string) => `${ns()}:ch:${channelId}:parts`,
  /** set: lowercased display names, for collision checks */
  names: (channelId: string) => `${ns()}:ch:${channelId}:names`,
  /** set: markers for events that must be emitted at most once, e.g. `timed_out:{participant_id}` */
  emitted: (channelId: string) => `${ns()}:ch:${channelId}:emitted`,
  /** string: stored post result, short TTL */
  idem: (channelId: string, clientId: string) => `${ns()}:ch:${channelId}:idem:${clientId}`,
  /** string: the first participant to speak, so an exchange can be recognised once */
  firstPoster: (channelId: string) => `${ns()}:ch:${channelId}:m:first`,
  /**
   * string: one product counter for one UTC day (PRODUCT section 14).
   *
   * Outside the `ch:` space on purpose. These outlive the channels that
   * incremented them and must not be swept with one, and nothing in the key
   * or the value names a channel.
   */
  metric: (day: string, name: string) => `${ns()}:m:${day}:${name}`,
  /** string: rate-limit counter, short TTL. The hash is salted; no raw IP is a key. */
  rateLimit: (scope: string, hash: string) => `${ns()}:rl:${scope}:${hash}`,
  /** sorted set of live channel IDs, score = expiry. The sweep's work list. */
  activeChannels: () => `${ns()}:channels:active`,
} as const

/** Every key a channel owns, apart from idempotency keys, which expire on their own. */
export function channelKeys(channelId: string): string[] {
  return [
    keys.channel(channelId),
    keys.seq(channelId),
    keys.items(channelId),
    keys.bytes(channelId),
    keys.parts(channelId),
    keys.names(channelId),
    keys.emitted(channelId),
  ]
}

/** Matches every key of one channel, including idempotency keys. Used by close. */
export function channelKeyPattern(channelId: string): string {
  return `${ns()}:ch:${channelId}*`
}
