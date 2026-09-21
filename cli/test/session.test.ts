import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decodeSession, encodeSession, normalizeHost, SessionError, type Session } from '../src/session.js'

const session: Session = {
  host: 'https://wave.davidsling.in',
  channel_id: '-j7yRyQ2',
  participant_id: 'p_9f3',
  token: '0fFZxYkzGUtCXYCmIQCeRvuw3FLAf1DurqQS',
}

describe('encodeSession', () => {
  it('round-trips every field', () => {
    expect(decodeSession(encodeSession(session))).toEqual(session)
  })

  it('round-trips the e2ee key when there is one, and omits it when there is not', () => {
    const keyed = { ...session, key: 'aGVsbG8td29ybGQtdGhpcy1pcy1hLWtleQ' }

    expect(decodeSession(encodeSession(keyed))).toEqual(keyed)
    expect(decodeSession(encodeSession(session))).not.toHaveProperty('key')
  })

  it('is one shell-safe word, so an agent can compose it into a command line', () => {
    const encoded = encodeSession({ ...session, key: 'k+e/y' })

    expect(encoded).toMatch(/^wv1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/)
  })

  it('keeps the host as an origin whatever it was given as', () => {
    expect(decodeSession(encodeSession({ ...session, host: 'https://wave.davidsling.in/' })).host).toBe(
      'https://wave.davidsling.in',
    )
    expect(decodeSession(encodeSession({ ...session, host: 'http://localhost:3000' })).host).toBe(
      'http://localhost:3000',
    )
  })

  it('refuses to mint a session that is already wrong', () => {
    expect(() => encodeSession({ ...session, token: '' })).toThrow(SessionError)
    expect(() => encodeSession({ ...session, host: 'wave.davidsling.in' })).toThrow(SessionError)
    // A channel URL where an origin belongs: every later request would be built
    // against the wrong base.
    expect(() => encodeSession({ ...session, host: 'https://wave.davidsling.in/c/-j7yRyQ2' })).toThrow(SessionError)
    expect(() => encodeSession({ ...session, participant_id: 'p 9f3' })).toThrow(SessionError)
  })
})

describe('decodeSession', () => {
  const encoded = encodeSession(session)

  it('says what a string that was never a session string is', () => {
    for (const value of ['', 'hello', 'wv2.abc.def', 'wv1.abc']) {
      expect(() => decodeSession(value), value).toThrow(/not a Wave session string/)
    }
  })

  it('rejects a string cut short rather than half-reading it', () => {
    // Every prefix of a real one: a scrollback cut, a wrapped line, a partial copy.
    for (let length = 1; length < encoded.length; length += 1) {
      expect(() => decodeSession(encoded.slice(0, length)), `${length}`).toThrow(SessionError)
    }
  })

  it('rejects a payload that was edited under its own checksum', () => {
    const [, payload, sum] = encoded.split('.') as [string, string, string]
    const edited = payload.slice(0, -1) + (payload.endsWith('A') ? 'B' : 'A')

    expect(() => decodeSession(`wv1.${edited}.${sum}`)).toThrow(/damaged or cut short/)
  })

  it('names the field a session string is missing, and populates nothing', () => {
    const partial = (fields: Record<string, unknown>) => {
      // Re-checksummed after the edit, because the checksum is not a signature:
      // what stands between a rewritten string and a half-populated session is
      // the field validation, and this is the test of it.
      const payload = Buffer.from(JSON.stringify(fields), 'utf8').toString('base64url')
      const sum = createHash('sha256').update(payload).digest('hex').slice(0, 8)
      return `wv1.${payload}.${sum}`
    }

    expect(() => decodeSession(partial({ ...session, token: undefined }))).toThrow(/missing its token/)
    expect(() => decodeSession(partial({ ...session, participant_id: undefined }))).toThrow(/missing its participant/)
    expect(() => decodeSession(partial({ ...session, channel_id: 42 }))).toThrow(/missing its channel id/)
    expect(() => decodeSession(partial({ ...session, host: 'ftp://wave.davidsling.in' }))).toThrow(/http or https/)
    expect(() => decodeSession(partial([session] as unknown as Record<string, unknown>))).toThrow(/damaged/)
  })

  it('tolerates the whitespace a copied line arrives with', () => {
    expect(decodeSession(`  ${encoded}\n`)).toEqual(session)
  })
})

describe('normalizeHost', () => {
  it('refuses anything that is not an origin', () => {
    for (const host of ['', 'wave.davidsling.in', 'https://wave.davidsling.in/c/x', 'https://w.in/?a=1']) {
      expect(() => normalizeHost(host), host).toThrow(SessionError)
    }
  })
})
