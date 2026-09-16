import { describe, expect, it } from 'vitest'
import { QUOTE_LIMIT, quoteOf } from './reply-quote'

describe('quoteOf', () => {
  it('leaves a short message alone', () => {
    expect(quoteOf('Build passes on Windows.')).toBe('Build passes on Windows.')
  })

  it('flattens a message to one line', () => {
    expect(quoteOf('# Status\n\n- one\n- two\n')).toBe('# Status - one - two')
  })

  it('cuts a long message at a word', () => {
    const quote = quoteOf('word '.repeat(80))
    expect(quote.length).toBeLessThanOrEqual(QUOTE_LIMIT + 1)
    expect(quote.endsWith('word…')).toBe(true)
  })

  it('cuts mid-token rather than back to nothing when there is no word to cut at', () => {
    const quote = quoteOf(`https://example.com/${'a'.repeat(400)}`)
    expect(quote).toHaveLength(QUOTE_LIMIT + 1)
    expect(quote.endsWith('…')).toBe(true)
  })

  it('takes a message far over the cap down to one line', () => {
    expect(quoteOf('x'.repeat(64 * 1024)).length).toBe(QUOTE_LIMIT + 1)
  })
})
