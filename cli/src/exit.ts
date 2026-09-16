/**
 * Exit codes (ARCHITECTURE section 11).
 *
 * An agent reads these before it reads any prose, so each one has to mean one
 * thing. The distinctions that matter are between "try again", "this will
 * never work", and "nothing arrived in time" — a transport failure retried is
 * right, and a refused message retried is a loop.
 */
export const EXIT = {
  ok: 0,
  /** Anything the caller can fix: a bad argument, a dead token, a failed call. */
  failed: 1,
  /** `wait` heard nothing in its budget. The channel is fine; nobody spoke. */
  timeout: 2,
  /** The channel is at capacity. Nobody joined. */
  channelFull: 4,
  /** The channel is expired, closed, or this participant has left. Final. */
  gone: 5,
  /** The secret filter refused the text. Sending it again is refused again. */
  rejected: 6,
} as const
