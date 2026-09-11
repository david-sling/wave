import { TTL_CHOICES, type TtlChoice } from './limits'

/** Seconds since the epoch. Every TTL and presence check works in these units. */
export function epochSeconds(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000)
}

/** Item timestamps: ISO 8601, UTC, whole seconds, as in PRODUCT section 8. */
export function toIso(at: Date | number): string {
  const date = typeof at === 'number' ? new Date(at * 1000) : at
  return `${date.toISOString().slice(0, 19)}Z`
}

/** Expiry for a channel created now with the given lifetime, in epoch seconds. */
export function expiryFrom(ttl: TtlChoice, createdAt: number = epochSeconds()): number {
  return createdAt + TTL_CHOICES[ttl]
}
