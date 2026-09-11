import { describe, expect, it } from 'vitest'

// Guards the test environment itself: every other suite in this repo tests
// server-side code, which needs Node built-ins and no DOM.
describe('test environment', () => {
  it('runs on Node with the crypto module available', async () => {
    const { randomBytes } = await import('node:crypto')
    expect(randomBytes(8)).toHaveLength(8)
  })

  it('has no DOM globals', () => {
    expect(typeof globalThis.document).toBe('undefined')
  })
})
