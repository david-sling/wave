import { describe, expect, it } from 'vitest'
import {
  itemSchema,
  parseChannel,
  parseItem,
  parseParticipant,
  serializeChannel,
  serializeItem,
  serializeParticipant,
  toAuthor,
  toRosterEntry,
  type ChannelRecord,
  type ParticipantRecord,
} from './types'

const message = {
  seq: 42,
  ts: '2026-09-11T10:15:02Z',
  type: 'message',
  from: { id: 'p_9f3', name: 'Windows agent', role: 'agent' },
  text: 'Build passes on Windows.',
  kind: 'message',
  reply_to: 40,
} as const

const event = {
  seq: 43,
  ts: '2026-09-11T10:15:40Z',
  type: 'system',
  event: 'participant.joined',
  subject: { id: 'p_1ab', name: "David's agent", role: 'agent' },
} as const

const channel: ChannelRecord = {
  id: 'ZmFrZS1jaGFubmVsLWlk',
  name: 'Release 4.2',
  mode: 'standard',
  created_at: 1_789_121_702,
  expires_at: 1_789_208_102,
  max_participants: 10,
  invite_hash: 'a'.repeat(64),
  admin_hash: 'b'.repeat(64),
}

const participant: ParticipantRecord = {
  id: 'p_9f3',
  name: 'Windows agent',
  role: 'agent',
  token_hash: 'c'.repeat(64),
  joined_at: 1_789_121_702,
  last_seen: 1_789_121_760,
  state: 'active',
}

describe('items', () => {
  it('accepts the message and event shapes from PRODUCT section 8', () => {
    expect(parseItem(serializeItem(message))).toEqual(message)
    expect(parseItem(serializeItem(event))).toEqual(event)
  })

  it('accepts a message without reply_to and an event without a subject', () => {
    const { reply_to: _reply, ...plain } = message
    const { subject: _subject, ...bare } = event
    expect(itemSchema.safeParse(plain).success).toBe(true)
    expect(itemSchema.safeParse(bare).success).toBe(true)
  })

  it.each([
    ['an unknown type', { ...message, type: 'note' }],
    ['an unknown event name', { ...event, event: 'participant.exploded' }],
    ['an unknown message kind', { ...message, kind: 'shout' }],
    ['empty text', { ...message, text: '' }],
    ['a sequence of zero', { ...message, seq: 0 }],
    ['a timestamp that is not ISO 8601', { ...message, ts: '11 Sep 2026' }],
    ['an author without a role', { ...message, from: { id: 'p_9f3', name: 'Windows agent' } }],
  ])('rejects %s', (_label, malformed) => {
    expect(itemSchema.safeParse(malformed).success).toBe(false)
  })
})

describe('channel records', () => {
  it('round-trips through the string fields of a Redis hash', () => {
    const stored = serializeChannel(channel)
    expect(Object.values(stored).every((value) => typeof value === 'string')).toBe(true)
    expect(parseChannel(stored)).toEqual(channel)
  })

  it('reads an absent channel as undefined', () => {
    expect(parseChannel(undefined)).toBeUndefined()
    expect(parseChannel({})).toBeUndefined()
  })

  it('throws on a record that lost a field', () => {
    const { expires_at: _expires, ...incomplete } = serializeChannel(channel)
    expect(() => parseChannel(incomplete)).toThrow()
  })

  it('holds no plain credential', () => {
    expect(JSON.stringify(serializeChannel(channel))).not.toMatch(/token/)
  })
})

describe('participant records', () => {
  it('carries the client into the roster when one was given', () => {
    expect(toRosterEntry({ ...participant, client: 'claude-code' }).client).toBe('claude-code')
    expect(toRosterEntry(participant).client).toBeUndefined()
  })

  it('round-trips', () => {
    expect(parseParticipant(serializeParticipant(participant))).toEqual(participant)
  })

  it('keeps the token hash out of the roster and out of items', () => {
    expect(toRosterEntry(participant)).toEqual({
      id: 'p_9f3',
      name: 'Windows agent',
      role: 'agent',
      presence: 'active',
    })
    expect(JSON.stringify(toRosterEntry(participant))).not.toContain(participant.token_hash)
    expect(toAuthor(participant)).toEqual({ id: 'p_9f3', name: 'Windows agent', role: 'agent' })
  })
})
