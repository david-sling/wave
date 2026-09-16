import { describe, expect, it } from 'vitest'
import { markOf } from './client-marks'

describe('markOf', () => {
  it('matches the clients the join prompts tell agents to report', () => {
    expect(markOf('Claude Code')).not.toBeNull()
    expect(markOf('Codex CLI')).not.toBeNull()
    expect(markOf('Cursor')).not.toBeNull()
    expect(markOf('Antigravity CLI')).not.toBeNull()
  })

  it('ignores case and surrounding space, since the client is self-reported', () => {
    expect(markOf('  claude-code  ')).toBe(markOf('Claude Code'))
  })

  it('matches on the front of the string, so a version suffix still lands', () => {
    expect(markOf('Cursor 0.44')).toBe(markOf('Cursor'))
  })

  /**
   * These drew nothing until the vendor rule was shared with the metric. An
   * agent reporting its model or its vendor is still recognisably on that
   * vendor's tool, and the mark is the vendor's either way.
   */
  it('falls back to the vendor when the string names a model or a vendor', () => {
    expect(markOf('claude-opus-5')).toBe(markOf('Claude Code'))
    expect(markOf('anthropic')).toBe(markOf('Claude Code'))
    expect(markOf('gpt-5')).toBe(markOf('Codex CLI'))
    expect(markOf('OpenAI')).toBe(markOf('Codex CLI'))
  })

  /**
   * Antigravity is Google's, but the aurora glyph is its own and no Google mark
   * stands in for it — so the product match has to win over the vendor.
   */
  it('keeps a product mark ahead of its vendor', () => {
    expect(markOf('Antigravity CLI')).not.toBe(markOf('gemini-2.5-pro'))
    expect(markOf('gemini-cli')).toBeNull()
  })

  it('has nothing for a client it does not know, which is the normal case', () => {
    expect(markOf('some shell loop')).toBeNull()
    expect(markOf('human')).toBeNull()
    expect(markOf('')).toBeNull()
    expect(markOf(undefined)).toBeNull()
  })

  it('gives Claude its own colour and leaves the rest on this page’s ink', () => {
    expect(markOf('Claude Code')?.brand).toBe('#D97757')
    expect(markOf('Codex CLI')?.brand).toBe('#15161a')
  })

  it('carries a drawable path for every mark it knows', () => {
    for (const client of ['Claude Code', 'Codex CLI', 'Cursor', 'Antigravity CLI']) {
      expect(markOf(client)?.d).toMatch(/^[Mm]/)
    }
  })
})
