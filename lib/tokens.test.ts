import { describe, expect, it } from 'vitest'
import {
  CHANNEL_ID_LENGTH,
  TOKEN_LENGTH,
  hashToken,
  isChannelId,
  isParticipantId,
  newChannelId,
  newParticipantId,
  newToken,
  tokenMatches,
} from './tokens'

const URL_SAFE = /^[A-Za-z0-9_-]+$/

describe('identifiers', () => {
  it('gives channel IDs 128 bits of entropy in a URL-safe encoding', () => {
    const id = newChannelId()
    expect(id).toHaveLength(CHANNEL_ID_LENGTH)
    expect(Buffer.from(id, 'base64url')).toHaveLength(16)
    expect(id).toMatch(URL_SAFE)
    expect(isChannelId(id)).toBe(true)
  })

  it('gives tokens 256 bits of entropy in a URL-safe encoding', () => {
    const token = newToken()
    expect(token).toHaveLength(TOKEN_LENGTH)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(token).toMatch(URL_SAFE)
  })

  it('prefixes participant IDs', () => {
    expect(isParticipantId(newParticipantId())).toBe(true)
    expect(isParticipantId('p_')).toBe(false)
    expect(isParticipantId(newChannelId())).toBe(false)
  })

  it('does not repeat itself', () => {
    const generated = new Set(Array.from({ length: 500 }, newChannelId))
    expect(generated.size).toBe(500)
  })

  it('rejects malformed channel IDs', () => {
    expect(isChannelId('')).toBe(false)
    expect(isChannelId('short')).toBe(false)
    expect(isChannelId(`${newChannelId()}x`)).toBe(false)
    expect(isChannelId(`${newChannelId().slice(0, -1)}/`)).toBe(false)
  })
})

describe('hashing and comparison', () => {
  it('hashes to a stable 256-bit hex digest', () => {
    const token = newToken()
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(token)).toBe(hashToken(token))
    expect(hashToken(token)).not.toBe(hashToken(newToken()))
  })

  it('never stores the token itself', () => {
    const token = newToken()
    expect(hashToken(token)).not.toContain(token)
  })

  it('matches a token against its own hash', () => {
    const token = newToken()
    expect(tokenMatches(token, hashToken(token))).toBe(true)
  })

  it.each([
    ['a different token', () => [newToken(), hashToken(newToken())]],
    ['a missing token', () => [undefined, hashToken(newToken())]],
    ['a missing hash', () => [newToken(), undefined]],
    ['an empty token', () => ['', hashToken('')]],
    ['a truncated hash', () => [newToken(), hashToken(newToken()).slice(0, 32)]],
    ['a hash that is not hex', () => [newToken(), 'not-a-hash']],
  ])('rejects %s', (_label, build) => {
    const [presented, expected] = build() as [string | undefined, string | undefined]
    expect(tokenMatches(presented, expected)).toBe(false)
  })
})
