import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Identifiers and credentials (PRODUCT section 8, ARCHITECTURE section 3).
 *
 * Channel IDs are 128-bit and URL-safe. Invite, participant, and admin tokens
 * are 256-bit and stored only as SHA-256 hashes, compared in constant time.
 * The channel ID is not a credential: it identifies, it never grants.
 */

const CHANNEL_ID_BYTES = 16
const TOKEN_BYTES = 32
const PARTICIPANT_ID_BYTES = 9

/** Length of a base64url encoding of `bytes` random bytes, unpadded. */
function encodedLength(bytes: number): number {
  return Math.ceil((bytes * 8) / 6)
}

export const CHANNEL_ID_LENGTH = encodedLength(CHANNEL_ID_BYTES)
export const TOKEN_LENGTH = encodedLength(TOKEN_BYTES)

const CHANNEL_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${CHANNEL_ID_LENGTH}}$`)
const PARTICIPANT_ID_PATTERN = new RegExp(`^p_[A-Za-z0-9_-]{${encodedLength(PARTICIPANT_ID_BYTES)}}$`)

/** A 128-bit URL-safe channel ID. */
export function newChannelId(): string {
  return randomBytes(CHANNEL_ID_BYTES).toString('base64url')
}

/** A participant ID. Public within the channel: shown in the roster and on every item. */
export function newParticipantId(): string {
  return `p_${randomBytes(PARTICIPANT_ID_BYTES).toString('base64url')}`
}

/** A 256-bit credential: invite, participant, or admin token. */
export function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/** The at-rest form of a token. Plain tokens are never stored or logged. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Constant-time check of a presented token against a stored hash.
 * Hashing first means the comparison is always over two 32-byte digests, so
 * the time taken reveals nothing about the token or the hash.
 */
export function tokenMatches(presented: string | undefined, expectedHash: string | undefined): boolean {
  if (!presented || !expectedHash) return false
  let expected: Buffer
  try {
    expected = Buffer.from(expectedHash, 'hex')
  } catch {
    return false
  }
  const actual = createHash('sha256').update(presented, 'utf8').digest()
  if (expected.length !== actual.length) return false
  return timingSafeEqual(actual, expected)
}

/** Shape check only. A well-formed ID still has to exist in storage. */
export function isChannelId(value: string): boolean {
  return CHANNEL_ID_PATTERN.test(value)
}

/** Shape check only, as {@link isChannelId}. */
export function isParticipantId(value: string): boolean {
  return PARTICIPANT_ID_PATTERN.test(value)
}
