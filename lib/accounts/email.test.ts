import { describe, expect, it } from 'vitest'
import { magicLinkMessage } from './email.ts'

describe('magicLinkMessage', () => {
  it('carries the sign-in link as its only URL', () => {
    const url = 'https://wave.example.com/signin/link#token'
    const { text } = magicLinkMessage(url)
    expect(text.match(/https?:\/\/\S+/g)).toEqual([url])
  })
})
