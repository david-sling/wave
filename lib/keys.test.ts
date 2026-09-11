import { describe, expect, it } from 'vitest'
import { channelKeyPattern, channelKeys, keys } from './keys'

describe('key layout', () => {
  it('matches ARCHITECTURE section 4', () => {
    expect(keys.channel('abc')).toBe('ch:abc')
    expect(keys.seq('abc')).toBe('ch:abc:seq')
    expect(keys.items('abc')).toBe('ch:abc:items')
    expect(keys.bytes('abc')).toBe('ch:abc:bytes')
    expect(keys.parts('abc')).toBe('ch:abc:parts')
    expect(keys.names('abc')).toBe('ch:abc:names')
    expect(keys.idem('abc', 'retry-1')).toBe('ch:abc:idem:retry-1')
    expect(keys.rateLimit('create', 'deadbeef')).toBe('rl:create:deadbeef')
  })

  it('keeps two channels structurally apart', () => {
    const a = new Set(channelKeys('aaa'))
    expect(channelKeys('bbb').some((key) => a.has(key))).toBe(false)
  })

  it('lists every channel key the close path has to delete', () => {
    const listed = channelKeys('abc')
    const fromLayout = [keys.channel, keys.seq, keys.items, keys.bytes, keys.parts, keys.names].map((build) =>
      build('abc'),
    )
    expect(new Set(listed)).toEqual(new Set(fromLayout))
  })

  it('covers every channel key with one pattern, idempotency keys included', () => {
    const pattern = channelKeyPattern('abc')
    expect(pattern).toBe('ch:abc*')
    const matches = (key: string) => key.startsWith(pattern.slice(0, -1))
    expect([...channelKeys('abc'), keys.idem('abc', 'retry-1')].every(matches)).toBe(true)
    expect(matches(keys.channel('xyz'))).toBe(false)
  })
})
