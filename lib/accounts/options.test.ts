import { describe, expect, it } from 'vitest'
import { withoutSessionTokens } from './options.ts'

const session = { id: 's1', token: 'secret', userId: 'u1' }

describe('withoutSessionTokens', () => {
  it('drops the token from the session /get-session answers with', () => {
    expect(withoutSessionTokens('/get-session', { session, user: { id: 'u1' } })).toEqual({
      session: { id: 's1', userId: 'u1' },
      user: { id: 'u1' },
    })
  })

  it('drops the token from every session /list-sessions answers with', () => {
    expect(withoutSessionTokens('/list-sessions', [session, { ...session, id: 's2' }])).toEqual([
      { id: 's1', userId: 'u1' },
      { id: 's2', userId: 'u1' },
    ])
  })

  it('leaves a signed-out answer and other paths alone', () => {
    expect(withoutSessionTokens('/get-session', null)).toBeNull()
    expect(withoutSessionTokens('/sign-out', { session })).toEqual({ session })
  })
})
