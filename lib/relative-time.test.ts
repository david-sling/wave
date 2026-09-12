import { describe, expect, it } from 'vitest'
import { relativeTime } from './relative-time'

const now = new Date('2026-09-12T12:00:00Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()

describe('relativeTime', () => {
  it.each([
    [0, 'just now'],
    [44, 'just now'],
    [45, '0m ago'],
    [90, '1m ago'],
    [59 * 60, '59m ago'],
    [60 * 60, '1h ago'],
    [23 * 3600, '23h ago'],
    [24 * 3600, '1d ago'],
    [8 * 86_400, '8d ago'],
  ])('reads %i seconds back as %s', (seconds, expected) => {
    expect(relativeTime(ago(seconds), now)).toBe(expected)
  })

  it('rounds down, so it never overstates the silence', () => {
    expect(relativeTime(ago(119), now)).toBe('1m ago')
  })

  it('treats a timestamp slightly in the future as now, not as a negative age', () => {
    expect(relativeTime(new Date(now.getTime() + 2_000).toISOString(), now)).toBe('just now')
  })

  it('says nothing for a timestamp it cannot read', () => {
    expect(relativeTime('not a date', now)).toBe('')
  })
})
