import { describe, expect, it } from 'vitest'
import {
  VISITED_CAP,
  byActivity,
  forget,
  live,
  noteMessage,
  parse,
  record,
  type VisitedChannel,
} from './visited-channels'

const now = Date.parse('2026-09-29T12:00:00Z')
const hour = 3_600_000

const channel = (id: string, overrides: Partial<VisitedChannel> = {}): VisitedChannel => ({
  id,
  invite: `inv-${id}`,
  name: `room ${id}`,
  expiresAt: now + hour,
  lastSeenAt: now - hour,
  addedAt: now - 2 * hour,
  lastMessageAt: 0,
  ...overrides,
})

const entry = (id: string, overrides: Partial<VisitedChannel> = {}) => {
  const { lastSeenAt: _, addedAt: __, lastMessageAt: ___, ...rest } = channel(id, overrides)
  return rest
}

describe('record', () => {
  it('adds a channel it has not seen, stamped with now', () => {
    expect(record([], entry('a'), now)).toEqual([{ ...entry('a'), lastSeenAt: now, addedAt: now, lastMessageAt: 0 }])
  })

  it('keeps when the room was first opened and the latest message known, across revisits', () => {
    const list = [channel('a', { addedAt: now - 5 * hour, lastMessageAt: now - 3 * hour })]
    expect(record(list, entry('a'), now)[0]).toMatchObject({ addedAt: now - 5 * hour, lastMessageAt: now - 3 * hour })
  })

  it('restores a forgotten entry with its own times, for undo', () => {
    const forgotten = channel('a', { addedAt: now - 5 * hour, lastMessageAt: now - 3 * hour })
    expect(record([], forgotten, now)[0]).toMatchObject({ addedAt: now - 5 * hour, lastMessageAt: now - 3 * hour })
  })

  it('upserts by id rather than duplicating, and takes the newer name and invite', () => {
    const list = record([channel('a')], entry('a', { name: 'renamed', invite: 'fresh' }), now)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'renamed', invite: 'fresh', lastSeenAt: now })
  })

  it('orders by lastSeenAt, most recent first', () => {
    const list = [channel('old', { lastSeenAt: now - 3 * hour }), channel('mid', { lastSeenAt: now - 2 * hour })]
    expect(record(list, entry('new'), now).map((c) => c.id)).toEqual(['new', 'mid', 'old'])
  })

  it('moves a revisited channel to the front', () => {
    const list = [channel('a', { lastSeenAt: now - hour }), channel('b', { lastSeenAt: now - 2 * hour })]
    expect(record(list, entry('b'), now).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('caps the list, dropping the least recently seen', () => {
    const list = Array.from({ length: VISITED_CAP }, (_, i) => channel(`c${i}`, { lastSeenAt: now - (i + 1) * 1000 }))
    const next = record(list, entry('new'), now)
    expect(next).toHaveLength(VISITED_CAP)
    expect(next[0].id).toBe('new')
    expect(next.map((c) => c.id)).not.toContain(`c${VISITED_CAP - 1}`)
  })

  it('prunes expired entries while it writes', () => {
    const list = [channel('gone', { expiresAt: now - 1 }), channel('kept')]
    expect(record(list, entry('a'), now).map((c) => c.id)).toEqual(['a', 'kept'])
  })
})

describe('noteMessage', () => {
  it('moves the latest message forward', () => {
    expect(noteMessage([channel('a')], 'a', now)[0].lastMessageAt).toBe(now)
  })

  it('returns the same list when the time is not newer, so nothing is written', () => {
    const list = [channel('a', { lastMessageAt: now })]
    expect(noteMessage(list, 'a', now)).toBe(list)
    expect(noteMessage(list, 'a', now - 1)).toBe(list)
  })

  it('returns the same list for a channel it does not hold', () => {
    const list = [channel('a')]
    expect(noteMessage(list, 'nope', now)).toBe(list)
  })
})

describe('byActivity', () => {
  it('orders by the latest message, not by when the room was last opened', () => {
    const list = [
      channel('quiet', { lastSeenAt: now, lastMessageAt: now - 3 * hour }),
      channel('busy', { lastSeenAt: now - hour, lastMessageAt: now - 60_000 }),
    ]
    expect(byActivity(list).map((c) => c.id)).toEqual(['busy', 'quiet'])
  })

  it('places a room nobody has spoken in by when it was opened', () => {
    const list = [channel('old', { lastMessageAt: now - hour }), channel('new', { addedAt: now - 60_000 })]
    expect(byActivity(list).map((c) => c.id)).toEqual(['new', 'old'])
  })

  it('does not reorder on a revisit', () => {
    const list = [channel('a', { lastMessageAt: now - 60_000 }), channel('b', { lastMessageAt: now - hour })]
    expect(byActivity(record(list, entry('b'), now)).map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('forget', () => {
  it('removes the channel and nothing else', () => {
    expect(forget([channel('a'), channel('b')], 'a').map((c) => c.id)).toEqual(['b'])
  })

  it('is a no-op for an id it does not hold', () => {
    const list = [channel('a')]
    expect(forget(list, 'nope')).toEqual(list)
  })
})

describe('live', () => {
  it('drops an entry at or past its expiry, going only by the clock it is given', () => {
    const list = [channel('past', { expiresAt: now - 1 }), channel('edge', { expiresAt: now }), channel('future')]
    expect(live(list, now).map((c) => c.id)).toEqual(['future'])
  })

  it('keeps the same entry when asked at an earlier time', () => {
    const list = [channel('a', { expiresAt: now })]
    expect(live(list, now - 1)).toEqual(list)
  })
})

describe('parse', () => {
  it('reads back what record wrote', () => {
    const list = record([channel('b')], entry('a'), now)
    expect(parse(JSON.stringify(list))).toEqual(list)
  })

  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['bad JSON', '{"id":'],
    ['an object', '{"id":"a"}'],
    ['a number', '42'],
    ['null', 'null'],
  ])('returns an empty list for %s', (_, raw) => {
    expect(parse(raw)).toEqual([])
  })

  it('drops a malformed entry and keeps the rest', () => {
    const good = channel('good')
    const raw = JSON.stringify([
      good,
      { ...channel('no-invite'), invite: undefined },
      { ...channel('empty-invite'), invite: '' },
      { ...channel('no-id'), id: undefined },
      { ...channel('string-expiry'), expiresAt: '2026-09-29T13:00:00Z' },
      { ...channel('string-seen'), lastSeenAt: 'yesterday' },
      null,
      'a string',
      7,
      [],
    ])
    expect(parse(raw)).toEqual([good])
  })

  it('treats a missing or non-string name as unnamed rather than dropping the entry', () => {
    const raw = JSON.stringify([
      { ...channel('a'), name: undefined },
      { ...channel('b'), name: 3 },
    ])
    expect(parse(raw).map((c) => [c.id, c.name])).toEqual([
      ['a', ''],
      ['b', ''],
    ])
  })

  it('keeps the first of two entries with the same id', () => {
    const raw = JSON.stringify([channel('a', { name: 'first' }), channel('a', { name: 'second' })])
    expect(parse(raw)).toEqual([channel('a', { name: 'first' })])
  })

  it('reads an entry written before addedAt and lastMessageAt existed', () => {
    const { addedAt: _, lastMessageAt: __, ...old } = channel('a')
    expect(parse(JSON.stringify([old]))[0]).toMatchObject({ addedAt: old.lastSeenAt, lastMessageAt: 0 })
  })

  it('does not carry unknown fields through', () => {
    const raw = JSON.stringify([{ ...channel('a'), preview: 'message text' }])
    expect(parse(raw)[0]).not.toHaveProperty('preview')
  })
})
