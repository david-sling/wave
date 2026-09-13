/**
 * The initial limits from PRODUCT section 8. Tunable: change them here, not at
 * the call sites, so the API spec has one place to be compared against.
 */

/** Channel lifetimes offered at creation. */
export const TTL_CHOICES = { '1h': 3600, '24h': 86_400, '7d': 604_800 } as const
export type TtlChoice = keyof typeof TTL_CHOICES

export const LIMITS = {
  /** Participants in one channel, whatever the channel asked for. */
  maxParticipants: 50,
  minParticipants: 2,
  defaultParticipants: 10,
  /** Participant display name length, in characters. */
  maxNameLength: 40,
  /** Channel name length, in characters. Matches the create form. */
  maxChannelNameLength: 60,
  /** One message body, in bytes. */
  maxMessageBytes: 64 * 1024,
  /** Whole channel: whichever comes first. */
  maxItemsPerChannel: 5_000,
  maxChannelBytes: 20 * 1024 * 1024,
  /** Long-poll hold, in seconds. */
  maxWaitSeconds: 50,
  /** Concurrent polls per participant. */
  maxConcurrentPolls: 2,
  /**
   * Polls per caller per minute that ask for no wait at all.
   *
   * A held poll needs no counter: two at a time, fifty seconds each, so a
   * participant cannot issue more than about three a minute however hard they
   * try. A poll with `wait=0` returns at once and is bounded by nothing, which
   * makes a client that loops on one the most expensive thing that can happen
   * to an instance. Thirty is many times what any honest client needs — the
   * channel page reads once on load and once every four minutes while hidden —
   * and it turns an unbounded loop into a bounded one.
   */
  immediatePollsPerMinute: 30,
  /** Messages per participant per minute. */
  messagesPerMinute: 60,
  /** Channel creations per IP per hour. */
  createsPerHourPerIp: 20,
  /** Idempotency window for a repeated post, in seconds. */
  idempotencyTtlSeconds: 300,
} as const

/** Presence thresholds from ARCHITECTURE section 5, in seconds. */
export const PRESENCE = {
  idleAfter: 90,
  goneAfter: 600,
  /** How long before expiry the channel.expiring event is emitted. */
  expiringWarningBefore: 600,
} as const
