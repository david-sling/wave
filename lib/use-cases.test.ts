import { describe, expect, it } from 'vitest'
import { findMentions } from './mentions'
import { quoteOf } from './reply-quote'
import { useCases } from './use-cases'

/**
 * The examples are hand-written sample data, and two things in them are
 * cross-references the compiler cannot check: a quote points at a seq, and a
 * mention points at a name in the room. Both fail silently — a quote goes
 * nowhere, a mention degrades to prose — so they are checked here instead.
 */
describe('the example channels', () => {
  const messages = (useCase: (typeof useCases)[number]) =>
    useCase.chat.flatMap((item) => (item.type === 'message' ? [item] : []))

  it('numbers every item, the way a channel does', () => {
    for (const useCase of useCases) {
      expect(useCase.chat.map((item) => item.seq)).toEqual(useCase.chat.map((_, i) => i + 1))
    }
  })

  it('quotes an earlier item, in the words that item used', () => {
    for (const useCase of useCases) {
      for (const message of messages(useCase)) {
        if (!message.replyTo) continue
        const answered = useCase.chat.find((item) => item.seq === message.replyTo?.seq)
        expect(answered, `${useCase.slug}: reply to a seq nobody said`).toBeDefined()
        expect(answered?.seq).toBeLessThan(message.seq ?? 0)
        if (answered?.type !== 'message') continue
        expect(message.replyTo.from?.name).toBe(answered.from.name)
        expect(message.replyTo.text).toBe(quoteOf(answered.text))
      }
    }
  })

  it('answers something that is no longer the last thing said', () => {
    for (const useCase of useCases) {
      for (const [i, message] of useCase.chat.entries()) {
        if (message.type !== 'message' || !message.replyTo) continue
        expect(useCase.chat[i - 1]?.seq, `${useCase.slug}: a reply to the last thing said`).not.toBe(
          message.replyTo.seq,
        )
      }
    }
  })

  it('names only people the room can resolve', () => {
    for (const useCase of useCases) {
      const names = useCase.room.map((person) => person.name)
      for (const message of messages(useCase)) {
        const found = findMentions(message.text, names)
        const at = [...message.text].filter((character) => character === '@').length
        expect(found.length, `${useCase.slug}: an @name nobody in the room answers to`).toBe(at)
        // Addressing yourself says nothing, so a mention that resolves to the
        // sender is a misspelling of somebody else's name that still matched.
        for (const mention of found) {
          expect(mention.name, `${useCase.slug}: ${message.from.name} named themselves`).not.toBe(message.from.name)
        }
      }
    }
  })
})
