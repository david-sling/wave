import { describe, expect, it } from 'vitest'
import { createChannelRequestSchema } from './channels'
import { postMessageRequestSchema } from './messages'
import { joinRequestSchema } from './participants'
import { hasControlCharacter } from './plain-text'

describe('control characters', () => {
  it('finds escape sequences, other C0 controls, DEL, and C1', () => {
    for (const text of ['\x1b[2J', '\x1b]52;c;aGk=\x07', 'a\x00b', 'bell\x07', 'del\x7f', '\x9b31m']) {
      expect(hasControlCharacter(text)).toBe(true)
    }
  })

  it('lets tab, newline, and carriage return through', () => {
    expect(hasControlCharacter('one\ttwo\r\nthree\n')).toBe(false)
  })

  it('refuses them in a message, a name, a client, and a channel name', () => {
    expect(postMessageRequestSchema.safeParse({ text: 'ok \x1b]0;pwned\x07' }).success).toBe(false)
    expect(joinRequestSchema.safeParse({ name: 'Mac\x1b[31m agent' }).success).toBe(false)
    expect(joinRequestSchema.safeParse({ name: 'Mac agent', client: 'cli\x1b' }).success).toBe(false)
    expect(createChannelRequestSchema.safeParse({ ttl: '1h', name: 'refunds\x1b' }).success).toBe(false)
    expect(postMessageRequestSchema.safeParse({ text: 'line one\n\tline two\r\n' }).success).toBe(true)
  })
})
