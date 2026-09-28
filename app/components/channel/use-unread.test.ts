import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { headKey, readKey } from '@/lib/unread'
import { dropHead, dropHeadsExcept, publishHead, unreadOf } from './use-unread'

const now = Date.parse('2026-09-29T12:00:00Z')

function fakeWindow() {
  const store = new Map<string, string>()
  const localStorage = {
    get length() {
      return store.size
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  return Object.assign(new EventTarget(), { localStorage, store })
}

let win: ReturnType<typeof fakeWindow>

beforeEach(() => {
  win = fakeWindow()
  vi.stubGlobal('window', win)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('unreadOf', () => {
  it('is unread once a tab publishes a message past the read mark', () => {
    win.store.set(readKey('a'), '3')
    publishHead('a', 5, now)
    expect(unreadOf('a', now)).toBe('unread')
  })

  it('clears when the read mark catches up, as it does when you read the room', () => {
    publishHead('a', 5, now)
    win.store.set(readKey('a'), '5')
    expect(unreadOf('a', now)).toBe('read')
  })

  it('is unknown for a room no tab has reported on', () => {
    expect(unreadOf('a', now)).toBe('unknown')
  })

  it('treats a missing read mark as nothing read', () => {
    publishHead('a', 1, now)
    expect(unreadOf('a', now)).toBe('unread')
  })
})

describe('publishHead', () => {
  it('announces the write to this tab', () => {
    const heard = vi.fn()
    win.addEventListener('wave:heads-changed', heard)
    publishHead('a', 1, now)
    expect(heard).toHaveBeenCalledTimes(1)
  })
})

describe('dropping heads', () => {
  it('drops one head', () => {
    publishHead('a', 1, now)
    dropHead('a')
    expect(win.store.has(headKey('a'))).toBe(false)
  })

  it('drops heads for rooms the list no longer holds, and nothing else', () => {
    publishHead('kept', 1, now)
    publishHead('gone', 1, now)
    win.store.set(readKey('gone'), '1')
    dropHeadsExcept(new Set(['kept']))
    expect([...win.store.keys()].sort()).toEqual([headKey('kept'), readKey('gone')].sort())
  })
})
