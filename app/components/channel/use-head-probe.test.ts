import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { headKey, PROBE } from '@/lib/unread'
import { VISITED_KEY } from '@/lib/visited-channels'
import { probeRound, startHeadProbe } from './use-head-probe'

const now = Date.parse('2026-09-29T12:00:00Z')

function fakeBrowser(visibility: 'visible' | 'hidden') {
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
  return {
    window: Object.assign(new EventTarget(), { localStorage }),
    document: { visibilityState: visibility },
    store,
  }
}

const room = (id: string) => ({
  id,
  invite: `inv-${id}`,
  name: id,
  expiresAt: now + 3_600_000,
  lastSeenAt: now,
  addedAt: now,
  lastMessageAt: 0,
})

let browser: ReturnType<typeof fakeBrowser>
let fetcher: ReturnType<typeof vi.fn>

function install(visibility: 'visible' | 'hidden', ids: string[]) {
  browser = fakeBrowser(visibility)
  browser.store.set(VISITED_KEY, JSON.stringify(ids.map(room)))
  vi.stubGlobal('window', browser.window)
  vi.stubGlobal('document', browser.document)
  fetcher = vi.fn(async () => Response.json({ last_seq: 5, last_message_seq: 4, expires_at: 'x' }))
  vi.stubGlobal('fetch', fetcher)
}

beforeEach(() => {
  vi.useFakeTimers({ now })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('probeRound', () => {
  it('asks about each room with its own invite, and records the head', async () => {
    install('visible', ['a'])
    expect(await probeRound(undefined, undefined, now)).toBe(1)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/channels/a/head',
      expect.objectContaining({ headers: { authorization: 'Bearer inv-a' } }),
    )
    expect(JSON.parse(browser.store.get(headKey('a'))!)).toMatchObject({ seq: 4 })
  })

  it('stops the round at a 429, leaving the rest stale', async () => {
    install('visible', ['a', 'b', 'c'])
    fetcher.mockResolvedValueOnce(new Response(null, { status: 429 }))
    expect(await probeRound(undefined, undefined, now)).toBe(1)
    expect(browser.store.has(headKey('b'))).toBe(false)
  })

  it('forgets a room that answers 410', async () => {
    install('visible', ['a', 'b'])
    fetcher.mockResolvedValueOnce(new Response(null, { status: 410 }))
    await probeRound(undefined, undefined, now)
    expect(JSON.parse(browser.store.get(VISITED_KEY)!).map((r: { id: string }) => r.id)).toEqual(['b'])
  })

  it('skips the room on screen', async () => {
    install('visible', ['here'])
    expect(await probeRound('here', undefined, now)).toBe(0)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('startHeadProbe', () => {
  it('makes no request from a hidden tab, however long it is left', async () => {
    install('hidden', ['a', 'b', 'c'])
    const stop = startHeadProbe(() => undefined)
    await vi.advanceTimersByTimeAsync(10 * (PROBE.intervalMs + PROBE.jitterMs))
    stop()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it(`asks about at most ${PROBE.perRound} rooms a round from a visible one`, async () => {
    install(
      'visible',
      Array.from({ length: 10 }, (_, i) => `r${i}`),
    )
    const stop = startHeadProbe(() => undefined)
    await vi.advanceTimersByTimeAsync(PROBE.intervalMs + PROBE.jitterMs)
    stop()
    expect(fetcher).toHaveBeenCalledTimes(PROBE.perRound)
  })

  it('waits a round before its first probe, so opening a page costs nothing extra', async () => {
    install('visible', ['a'])
    const stop = startHeadProbe(() => undefined)
    await vi.advanceTimersByTimeAsync(PROBE.intervalMs - PROBE.jitterMs - 1)
    stop()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
