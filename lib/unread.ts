/**
 * Unread, from what tabs already know (#73).
 *
 * A tab polling a channel publishes the seq of its latest message as that
 * channel's head. Compared with the read mark, that says whether a room in the
 * pane has something you have not seen, without a request.
 */

export type Head = {
  /** Seq of the latest message, not of the latest item: a join is not news. */
  seq: number
  /** Epoch ms the head was last confirmed. */
  at: number
}

export type UnreadState = 'unread' | 'read' | 'unknown'

export const HEAD_PREFIX = 'wave.head.'
export const headKey = (channelId: string) => `${HEAD_PREFIX}${channelId}`
export const readKey = (channelId: string) => `wave.read.${channelId}`

/** How long a head counts as current: a visible tab re-confirms it at least every 50s poll. */
export const HEAD_FRESH_MS = 90_000

export function parseHead(raw: string | null): Head | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { seq, at } = value as Record<string, unknown>
    if (typeof seq !== 'number' || !Number.isFinite(seq) || typeof at !== 'number' || !Number.isFinite(at)) return null
    return { seq, at }
  } catch {
    return null
  }
}

/**
 * A head past the read mark is unread however old it is: a message was seen
 * and nobody has read it. A head at or behind the mark only says caught up
 * while it is fresh; after that nobody knows what has happened since.
 */
export function unreadState(head: Head | null, readSeq: number, now: number): UnreadState {
  if (head === null) return 'unknown'
  if (head.seq > readSeq) return 'unread'
  return now - head.at <= HEAD_FRESH_MS ? 'read' : 'unknown'
}
