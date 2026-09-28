import { describe, expect, it } from 'vitest'
import { HEAD_FRESH_MS, parseHead, unreadState } from './unread'

const now = Date.parse('2026-09-29T12:00:00Z')

describe('unreadState', () => {
  it('is unread when the latest message is past the read mark', () => {
    expect(unreadState({ seq: 9, at: now }, 7, now)).toBe('unread')
  })

  it('stays unread when the head is old: the message is still unread', () => {
    expect(unreadState({ seq: 9, at: now - 10 * HEAD_FRESH_MS }, 7, now)).toBe('unread')
  })

  it('is read when a fresh head is at the mark', () => {
    expect(unreadState({ seq: 9, at: now - 1_000 }, 9, now)).toBe('read')
  })

  it('is read when the mark is past the head, as it is after a join nobody needs to see', () => {
    expect(unreadState({ seq: 9, at: now }, 12, now)).toBe('read')
  })

  it('is unknown, not read, when the head that said so has gone stale', () => {
    expect(unreadState({ seq: 9, at: now - HEAD_FRESH_MS - 1 }, 9, now)).toBe('unknown')
  })

  it('is unknown when no tab has published a head', () => {
    expect(unreadState(null, 0, now)).toBe('unknown')
  })
})

describe('parseHead', () => {
  it('reads what a tab writes', () => {
    expect(parseHead(JSON.stringify({ seq: 4, at: now }))).toEqual({ seq: 4, at: now })
  })

  it.each([null, '', '{', '4', 'null', '{"seq":"4","at":1}', '{"seq":4}'])('returns null for %j', (raw) => {
    expect(parseHead(raw)).toBeNull()
  })
})
