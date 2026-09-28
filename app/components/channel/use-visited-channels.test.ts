import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VISITED_KEY } from '@/lib/visited-channels'
import { forgetChannel, noteChannelMessage, rememberChannel, snapshot, subscribe } from './use-visited-channels'

const now = Date.parse('2026-09-29T12:00:00Z')
const room = (id: string) => ({ id, invite: `inv-${id}`, name: `room ${id}`, expiresAt: now + 3_600_000 })

function fakeWindow({ throwing = false } = {}) {
  const store = new Map<string, string>()
  const events = new EventTarget()
  const localStorage = {
    getItem: (key: string) => {
      if (throwing) throw new Error('SecurityError')
      return store.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (throwing) throw new Error('QuotaExceededError')
      store.set(key, value)
    },
  }
  return Object.assign(events, { localStorage, store })
}

let win: ReturnType<typeof fakeWindow>

beforeEach(() => {
  win = fakeWindow()
  vi.stubGlobal('window', win)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('rememberChannel', () => {
  it('writes the channel to the one key', () => {
    rememberChannel(room('a'), now)
    expect(JSON.parse(win.store.get(VISITED_KEY)!)).toEqual([
      { ...room('a'), lastSeenAt: now, addedAt: now, lastMessageAt: 0 },
    ])
  })

  it('does not duplicate on a reload, and moves lastSeenAt', () => {
    rememberChannel(room('a'), now)
    rememberChannel(room('a'), now + 5_000)
    expect(snapshot()).toEqual([{ ...room('a'), lastSeenAt: now + 5_000, addedAt: now, lastMessageAt: 0 }])
  })

  it('records nothing for a channel whose expiry cannot be read', () => {
    rememberChannel({ ...room('a'), expiresAt: Number.NaN }, now)
    expect(snapshot()).toEqual([])
  })

  it('records nothing without an invite, since the entry could not open the room', () => {
    rememberChannel({ ...room('a'), invite: '' }, now)
    expect(snapshot()).toEqual([])
  })
})

describe('forgetChannel', () => {
  it('removes the channel and keeps the rest', () => {
    rememberChannel(room('a'), now)
    rememberChannel(room('b'), now + 1)
    forgetChannel('a')
    expect(snapshot().map((c) => c.id)).toEqual(['b'])
  })
})

describe('noteChannelMessage', () => {
  it('writes and announces a newer message, and does neither for an older one', () => {
    rememberChannel(room('a'), now)
    const onChange = vi.fn()
    const unsubscribe = subscribe(onChange)
    noteChannelMessage('a', now + 1_000)
    expect(snapshot()[0].lastMessageAt).toBe(now + 1_000)
    noteChannelMessage('a', now)
    expect(onChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})

describe('subscribe', () => {
  it('hears a write made in this tab', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribe(onChange)
    rememberChannel(room('a'), now)
    forgetChannel('a')
    expect(onChange).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('hears a write made in another tab, and ignores other keys', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribe(onChange)
    const storage = (key: string | null) => Object.assign(new Event('storage'), { key })
    win.dispatchEvent(storage('wave.read.a'))
    expect(onChange).not.toHaveBeenCalled()
    win.dispatchEvent(storage(VISITED_KEY))
    win.dispatchEvent(storage(null))
    expect(onChange).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('stops listening once unsubscribed', () => {
    const onChange = vi.fn()
    subscribe(onChange)()
    rememberChannel(room('a'), now)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('snapshot', () => {
  it('returns the same array until the stored value changes', () => {
    rememberChannel(room('a'), now)
    const first = snapshot()
    expect(snapshot()).toBe(first)
    rememberChannel(room('b'), now + 1)
    expect(snapshot()).not.toBe(first)
  })

  it('returns the same empty array every time when nothing is stored', () => {
    expect(snapshot()).toBe(snapshot())
  })
})

describe('with storage throwing, as in private browsing', () => {
  beforeEach(() => {
    win = fakeWindow({ throwing: true })
    vi.stubGlobal('window', win)
  })

  it('remembers and forgets without throwing, and reads back as empty', () => {
    expect(() => rememberChannel(room('a'), now)).not.toThrow()
    expect(() => forgetChannel('a')).not.toThrow()
    expect(snapshot()).toEqual([])
    expect(snapshot()).toBe(snapshot())
  })
})
