import { z } from 'zod'
import { LIMITS } from './limits'

/**
 * The shapes in PRODUCT sections 8 and 9, as schemas rather than prose.
 * Anything read back out of Redis is parsed through these, so a corrupt or
 * hand-edited record fails loudly instead of flowing into a response.
 */

export const roleSchema = z.enum(['agent', 'human'])
export type Role = z.infer<typeof roleSchema>

export const presenceSchema = z.enum(['active', 'idle', 'gone'])
export type Presence = z.infer<typeof presenceSchema>

export const modeSchema = z.enum(['standard'])
export type Mode = z.infer<typeof modeSchema>

export const messageKindSchema = z.enum(['message', 'done'])
export type MessageKind = z.infer<typeof messageKindSchema>

export const eventNameSchema = z.enum([
  'participant.joined',
  'participant.left',
  'participant.timed_out',
  'participant.rejoined',
  'channel.expiring',
  'channel.closing',
])
export type EventName = z.infer<typeof eventNameSchema>

const seqSchema = z.int().positive()
const timestampSchema = z.iso.datetime()

/** How a participant appears on an item: identity only, no presence or token. */
export const authorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(LIMITS.maxNameLength),
  role: roleSchema,
})
export type Author = z.infer<typeof authorSchema>

/** How a participant appears in a roster. */
export const rosterEntrySchema = authorSchema.extend({ presence: presenceSchema })
export type RosterEntry = z.infer<typeof rosterEntrySchema>

export const messageItemSchema = z.object({
  seq: seqSchema,
  ts: timestampSchema,
  type: z.literal('message'),
  from: authorSchema,
  // A cheap upper bound in characters. The byte cap itself is enforced on post.
  text: z.string().min(1).max(LIMITS.maxMessageBytes),
  kind: messageKindSchema,
  reply_to: seqSchema.optional(),
})
export type MessageItem = z.infer<typeof messageItemSchema>

export const systemItemSchema = z.object({
  seq: seqSchema,
  ts: timestampSchema,
  type: z.literal('system'),
  event: eventNameSchema,
  subject: authorSchema.optional(),
})
export type SystemItem = z.infer<typeof systemItemSchema>

/** Everything in the transcript: messages and events share one sequence. */
export const itemSchema = z.discriminatedUnion('type', [messageItemSchema, systemItemSchema])
export type Item = z.infer<typeof itemSchema>

/**
 * The `ch:{id}` hash. Secrets are present only as hashes; no plain token is
 * ever written to storage.
 */
export const channelRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(LIMITS.maxChannelNameLength).default(''),
  mode: modeSchema,
  created_at: z.coerce.number().int().positive(),
  expires_at: z.coerce.number().int().positive(),
  max_participants: z.coerce.number().int().min(LIMITS.minParticipants).max(LIMITS.maxParticipants),
  invite_hash: z.string().length(64),
  admin_hash: z.string().length(64),
})
export type ChannelRecord = z.infer<typeof channelRecordSchema>

/** One field of the `ch:{id}:parts` hash, stored as JSON. */
export const participantRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(LIMITS.maxNameLength),
  role: roleSchema,
  token_hash: z.string().length(64),
  joined_at: z.coerce.number().int().positive(),
  last_seen: z.coerce.number().int().positive(),
  state: presenceSchema,
  /** Self-reported agent product, from join. Free text, shown to nobody by default. */
  client: z.string().max(120).optional(),
})
export type ParticipantRecord = z.infer<typeof participantRecordSchema>

/** Redis hashes hold strings. This is the only place that conversion happens. */
export function serializeChannel(channel: ChannelRecord): Record<string, string> {
  return {
    id: channel.id,
    name: channel.name,
    mode: channel.mode,
    created_at: String(channel.created_at),
    expires_at: String(channel.expires_at),
    max_participants: String(channel.max_participants),
    invite_hash: channel.invite_hash,
    admin_hash: channel.admin_hash,
  }
}

/** Returns undefined for an absent channel; throws for a malformed one. */
export function parseChannel(hash: Record<string, string> | undefined): ChannelRecord | undefined {
  if (!hash || Object.keys(hash).length === 0) return undefined
  return channelRecordSchema.parse(hash)
}

export function serializeParticipant(participant: ParticipantRecord): string {
  return JSON.stringify(participant)
}

export function parseParticipant(raw: string): ParticipantRecord {
  return participantRecordSchema.parse(JSON.parse(raw))
}

export function serializeItem(item: Item): string {
  return JSON.stringify(item)
}

export function parseItem(raw: string): Item {
  return itemSchema.parse(JSON.parse(raw))
}

/** The roster view of a participant: presence, never the token hash. */
export function toRosterEntry(participant: ParticipantRecord): RosterEntry {
  return {
    id: participant.id,
    name: participant.name,
    role: participant.role,
    presence: participant.state,
  }
}

/** The item view of a participant. */
export function toAuthor(participant: ParticipantRecord): Author {
  return { id: participant.id, name: participant.name, role: participant.role }
}
