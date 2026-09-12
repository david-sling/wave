import { describe, expect, it } from 'vitest'
import { channelKeyPattern, channelKeys, keys } from './keys'


describe('key layout', () => {
  it('matches ARCHITECTURE section 4', () => {
    expect(keys.channel('abc')).toBe('wave:ch:abc')
    expect(keys.seq('abc')).toBe('wave:ch:abc:seq')
    expect(keys.items('abc')).toBe('wave:ch:abc:items')
    expect(keys.bytes('abc')).toBe('wave:ch:abc:bytes')
    expect(keys.parts('abc')).toBe('wave:ch:abc:parts')
    expect(keys.names('abc')).toBe('wave:ch:abc:names')
    expect(keys.idem('abc', 'retry-1')).toBe('wave:ch:abc:idem:retry-1')
    expect(keys.rateLimit('create', 'deadbeef')).toBe('wave:rl:create:deadbeef')
    expect(keys.activeChannels()).toBe('wave:channels:active')
  })

  it('keeps two channels structurally apart', () => {
    const a = new Set(channelKeys('aaa'))
    expect(channelKeys('bbb').some((key) => a.has(key))).toBe(false)
  })

  it('lists every channel key the close path has to delete', () => {
    const listed = channelKeys('abc')
    const fromLayout = [keys.channel, keys.seq, keys.items, keys.bytes, keys.parts, keys.names, keys.emitted].map(
      (build) =>
        build('abc'),
    )
    expect(new Set(listed)).toEqual(new Set(fromLayout))
  })

  it('namespaces every key so another app can share the same Redis', () => {
    const everyKey = [...channelKeys('abc'), keys.idem('abc', 'r'), keys.rateLimit('create', 'h'), keys.activeChannels()]
    expect(everyKey.every((key) => key.startsWith('wave:'))).toBe(true)
  })

  it('covers every channel key with one pattern, idempotency keys included', () => {
    const pattern = channelKeyPattern('abc')
    expect(pattern).toBe('wave:ch:abc*')
    const matches = (key: string) => key.startsWith(pattern.slice(0, -1))
    expect([...channelKeys('abc'), keys.idem('abc', 'retry-1')].every(matches)).toBe(true)
    expect(matches(keys.channel('xyz'))).toBe(false)
  })
})
