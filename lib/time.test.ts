import { describe, expect, it } from 'vitest'
import { epochSeconds, expiryFrom, toIso } from './time'

describe('time helpers', () => {
  it('formats item timestamps to whole seconds in UTC', () => {
    expect(toIso(new Date('2026-09-11T10:15:02.812Z'))).toBe('2026-09-11T10:15:02Z')
    expect(toIso(1_789_121_702)).toBe('2026-09-11T10:15:02Z')
  })

  it('counts epoch seconds, not milliseconds', () => {
    expect(epochSeconds(new Date('2026-09-11T10:15:02.812Z'))).toBe(1_789_121_702)
  })

  it('turns a lifetime choice into an expiry', () => {
    expect(expiryFrom('1h', 1_000)).toBe(1_000 + 3_600)
    expect(expiryFrom('24h', 1_000)).toBe(1_000 + 86_400)
    expect(expiryFrom('7d', 1_000)).toBe(1_000 + 604_800)
  })
})
