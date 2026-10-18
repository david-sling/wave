import { describe, expect, it } from 'vitest'
import { sealInvite, unsealInvite } from './seal.ts'

const secret = 'test-secret-test-secret-test-secret-00'

describe('sealInvite', () => {
  it('opens for the same account and channel', () => {
    const sealed = sealInvite(secret, 'acct-a', 'chan-1', 'invite-token')
    expect(sealed).not.toContain('invite-token')
    expect(unsealInvite(secret, 'acct-a', 'chan-1', sealed)).toBe('invite-token')
  })

  it('seals the same invite differently each time', () => {
    expect(sealInvite(secret, 'acct-a', 'chan-1', 'x')).not.toBe(sealInvite(secret, 'acct-a', 'chan-1', 'x'))
  })

  it('does not open in another account or channel row', () => {
    const sealed = sealInvite(secret, 'acct-a', 'chan-1', 'invite-token')
    expect(unsealInvite(secret, 'acct-b', 'chan-1', sealed)).toBeNull()
    expect(unsealInvite(secret, 'acct-a', 'chan-2', sealed)).toBeNull()
  })

  it('does not open under another secret, or once tampered with', () => {
    const sealed = sealInvite(secret, 'acct-a', 'chan-1', 'invite-token')
    expect(unsealInvite('another-secret-another-secret-another', 'acct-a', 'chan-1', sealed)).toBeNull()
    const [v, n, body] = sealed.split('.')
    const flipped = Buffer.from(body, 'base64url')
    flipped[0] ^= 1
    expect(unsealInvite(secret, 'acct-a', 'chan-1', `${v}.${n}.${flipped.toString('base64url')}`)).toBeNull()
    expect(unsealInvite(secret, 'acct-a', 'chan-1', 'garbage')).toBeNull()
  })
})
