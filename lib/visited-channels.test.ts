import { describe, expect, it } from 'vitest'
import { VISITED_CAP, forget, live, parse, record, type VisitedChannel } from './visited-channels'

const now = Date.parse('2026-09-29T12:00:00Z')
const hour = 3_600_000

const channel = (id: string, overrides: Partial<VisitedChannel> = {}): VisitedChannel => ({
  id,
  invite: `inv-${id}`,
  name: `room ${id}`,
  expiresAt: now + hour,
  lastSeenAt: now - hour,
  ...overrides,
})

const entry = (id: string, overrides: Partial<VisitedChannel> = {}) => {
  const { lastSeenAt: _, ...rest } = channel(id, overrides)
  return rest
}

describe('record', () => {
  it('adds a channel it has not seen, stamped with now', () => {
    expect(record([], entry('a'), now)).toEqual([{ ...entry('a'), lastSeenAt: now }])
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

  it('does not carry unknown fields through', () => {
    const raw = JSON.stringify([{ ...channel('a'), preview: 'message text' }])
    expect(parse(raw)[0]).not.toHaveProperty('preview')
  })
})
