import { describe, expect, it } from 'vitest'
import { namesAModel, vendorOf } from './vendors'

/**
 * One rule, because two callers read it: the metric that counts clients and the
 * marks that draw them. A string that earns a vendor's mark has to count as
 * that vendor, and it did not while each side matched separately.
 */
describe('vendorOf', () => {
  it('reads the vendor from a product, a model, or a bare vendor name', () => {
    expect(vendorOf('Claude Code')).toBe('anthropic')
    expect(vendorOf('claude-opus-5')).toBe('anthropic')
    expect(vendorOf('anthropic')).toBe('anthropic')
    expect(vendorOf('Codex CLI')).toBe('openai')
    expect(vendorOf('gpt-5')).toBe('openai')
    expect(vendorOf('o3')).toBe('openai')
    expect(vendorOf('Antigravity CLI')).toBe('google')
    expect(vendorOf('gemini-cli')).toBe('google')
  })

  it('has no vendor for a tool that is its own, or for a stranger', () => {
    expect(vendorOf('Cursor')).toBeNull()
    expect(vendorOf('some shell loop')).toBeNull()
    expect(vendorOf(undefined)).toBeNull()
  })
})

describe('namesAModel', () => {
  it('separates a model from the product that runs it', () => {
    expect(namesAModel('claude-sonnet-4-5')).toBe(true)
    expect(namesAModel('opus')).toBe(true)
    expect(namesAModel('gpt-5')).toBe(true)
    expect(namesAModel('gemini-2.5-pro')).toBe(true)
  })

  it('leaves the products alone, including the ones that start the same way', () => {
    expect(namesAModel('claude-code')).toBe(false)
    expect(namesAModel('claude-cowork')).toBe(false)
    expect(namesAModel('gemini-cli')).toBe(false)
    expect(namesAModel('codex-cli')).toBe(false)
  })
})
