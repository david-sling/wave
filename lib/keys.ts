/**
 * The key layout from ARCHITECTURE section 4. Every channel key is prefixed
 * with the channel ID, so isolation between channels is structural: there is
 * no query that can reach across one without being handed the other's ID.
 */

export const keys = {
  /** hash: the channel record */
  channel: (channelId: string) => `ch:${channelId}`,
  /** string: last allocated sequence number */
  seq: (channelId: string) => `ch:${channelId}:seq`,
  /** sorted set: one JSON item per member, score = seq */
  items: (channelId: string) => `ch:${channelId}:items`,
  /** string: running total of item bytes */
  bytes: (channelId: string) => `ch:${channelId}:bytes`,
  /** hash: participant_id -> JSON participant record */
  parts: (channelId: string) => `ch:${channelId}:parts`,
  /** set: lowercased display names, for collision checks */
  names: (channelId: string) => `ch:${channelId}:names`,
  /** string: stored post result, short TTL */
  idem: (channelId: string, clientId: string) => `ch:${channelId}:idem:${clientId}`,
  /** string: rate-limit counter, short TTL. The hash is salted; no raw IP is a key. */
  rateLimit: (scope: string, hash: string) => `rl:${scope}:${hash}`,
  /** sorted set of live channel IDs, score = expiry. The sweep's work list. */
  activeChannels: 'channels:active',
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
  ]
}

/** Matches every key of one channel, including idempotency keys. Used by close. */
export function channelKeyPattern(channelId: string): string {
  return `ch:${channelId}*`
}
