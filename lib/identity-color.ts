/**
 * A colour per participant, derived rather than assigned.
 *
 * Channels have no accounts and no server-side palette: a participant exists
 * for an hour and is gone. So the colour comes from a hash of what identifies
 * them, which means every reader computes the same colour for the same person
 * without anything being stored or coordinated.
 *
 * The seed is the display name and role, not the participant ID: names are
 * already unique within a channel (join deduplicates them), and an agent that
 * rejoins under the same name keeps its colour rather than becoming a stranger.
 *
 * Saturation and lightness are fixed, so every colour lands in the same register
 * as the sky and peach tints the rest of the system uses — only the hue moves.
 *
 * The hue is a bucket rather than a raw angle, and within one channel buckets
 * are claimed rather than shared: a hash alone put two agents a single degree
 * apart, which is the same as giving them one colour.
 */

export type IdentityColor = {
  /** Tile fill: a pale tint, as `sky-soft` and `peach-soft` are. */
  fill: string
  /** Text on that fill: the same hue, dark enough to read at 12px bold. */
  ink: string
}

/** Twelve hues, 30 degrees apart: distinguishable side by side, and more than most channels need. */
export const HUE_BUCKETS = 12

const TILE_SATURATION = 84
const TILE_LIGHTNESS = 92
const INK_SATURATION = 46
const INK_LIGHTNESS = 30

/** FNV-1a. Small, dependency-free, and avalanches well enough that "Agent A" and "Agent B" land apart. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The bucket a seed prefers, before anyone else has claimed it. */
export function identityBucket(seed: string): number {
  return hashSeed(seed) % HUE_BUCKETS
}

export function identityHue(seed: string): number {
  return identityBucket(seed) * (360 / HUE_BUCKETS)
}

/** Normalised the way a channel normalises names, so stray case or spacing cannot recolour someone. */
function seedFor(name: string, role: string): string {
  return `${name.trim().toLowerCase()}:${role.trim().toLowerCase()}`
}

function colorForBucket(bucket: number): IdentityColor {
  const hue = bucket * (360 / HUE_BUCKETS)
  return {
    fill: `hsl(${hue} ${TILE_SATURATION}% ${TILE_LIGHTNESS}%)`,
    ink: `hsl(${hue} ${INK_SATURATION}% ${INK_LIGHTNESS}%)`,
  }
}

/** The colour a participant gets on their own, with no roster to compare against. */
export function identityColor(name: string, role: string): IdentityColor {
  return colorForBucket(identityBucket(seedFor(name, role)))
}

export type Identified = { name: string; role: string }

/**
 * Colours for everyone in a channel, with no two alike.
 *
 * Each participant takes the bucket its own hash asks for; if an earlier
 * participant already holds it, it takes the next free one. Order is join
 * order, so someone arriving never recolours anyone already in the room. Past
 * twelve participants the buckets run out and repeat, which is the point at
 * which a roster is doing the telling-apart anyway.
 */
export function identityPalette(participants: readonly Identified[]): (name: string, role: string) => IdentityColor {
  const claimed = new Map<number, string>()
  const assigned = new Map<string, IdentityColor>()

  for (const participant of participants) {
    const key = seedFor(participant.name, participant.role)
    if (assigned.has(key)) continue

    const preferred = identityBucket(key)
    let bucket = preferred
    for (let step = 0; step < HUE_BUCKETS && claimed.has(bucket); step += 1) {
      bucket = (preferred + step + 1) % HUE_BUCKETS
    }
    claimed.set(bucket, key)
    assigned.set(key, colorForBucket(bucket))
  }

  // A name in the transcript may have left the roster; it still needs a colour.
  return (name, role) => assigned.get(seedFor(name, role)) ?? identityColor(name, role)
}
