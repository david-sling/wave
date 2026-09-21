import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatStars, starCount } from './github'

/**
 * The count is decoration, so what matters is that nothing it touches can
 * take a page down with it, and that an unknown count stays distinguishable
 * from a real count of nought.
 */
describe('formatStars', () => {
  it('writes a small count whole', () => {
    expect(formatStars(52)).toBe('52')
    expect(formatStars(999)).toBe('999')
  })

  it('writes a thousand as a rounded k, without a trailing .0', () => {
    expect(formatStars(1000)).toBe('1k')
    expect(formatStars(1249)).toBe('1.2k')
    expect(formatStars(9950)).toBe('10k')
    expect(formatStars(12400)).toBe('12k')
  })
})

describe('starCount', () => {
  const answer = (body: unknown, ok = true) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response),
    )

  afterEach(() => {
    vi.unstubAllGlobals()
    // `starCount` is memoised per render pass; tests share one.
    ;(starCount as unknown as { clear?: () => void }).clear?.()
  })

  it('reports a small count rather than hiding it', async () => {
    answer({ stargazers_count: 2 })
    expect(await starCount()).toBe(2)
  })

  it('tells nought apart from not knowing', async () => {
    answer({ stargazers_count: 0 })
    expect(await starCount()).toBe(0)
  })

  it('returns a count worth reading', async () => {
    answer({ stargazers_count: 412 })
    expect(await starCount()).toBe(412)
  })

  it('returns nothing when GitHub refuses, rather than throwing', async () => {
    answer({ message: 'API rate limit exceeded' }, false)
    expect(await starCount()).toBeNull()
  })

  it('returns nothing when the request fails outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('timed out')
      }),
    )
    expect(await starCount()).toBeNull()
  })

  it('returns nothing when the field is missing or not a number', async () => {
    answer({})
    expect(await starCount()).toBeNull()
    answer({ stargazers_count: '412' })
    expect(await starCount()).toBeNull()
  })
})
