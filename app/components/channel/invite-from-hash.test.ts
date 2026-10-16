import { describe, expect, it } from 'vitest'
import { inviteFromHash } from './use-channel'

describe('inviteFromHash', () => {
  it('reads the invite from a normal fragment', () => {
    expect(inviteFromHash('#q1pk-Osg_Wb')).toBe('q1pk-Osg_Wb')
  })

  it('reads one invite from a fragment Next wrote twice', () => {
    expect(inviteFromHash('#q1pk-Osg_Wb#q1pk-Osg_Wb')).toBe('q1pk-Osg_Wb')
  })

  it('returns null without an invite', () => {
    expect(inviteFromHash('')).toBeNull()
    expect(inviteFromHash('#')).toBeNull()
  })
})
