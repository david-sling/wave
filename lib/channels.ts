import { z } from 'zod'
import { getConfig } from './config'
import { appendItem, lastSeq } from './items'
import { channelKeyPattern, keys } from './keys'
import { LIMITS, PRESENCE, TTL_CHOICES } from './limits'
import { countChannelCreated } from './metrics'
import { applyChannelTtl, forgetActiveChannel, registerActiveChannel, type WaveRedis } from './redis'
import { epochSeconds, expiryFrom, toIso } from './time'
import { hashToken, newChannelId, newToken } from './tokens'
import {
  modeSchema,
  parseParticipant,
  serializeChannel,
  toRosterEntry,
  type ChannelRecord,
  type ParticipantRecord,
  type Presence,
  type RosterEntry,
} from './types'

/** Channel lifecycle: create, read, close (PRODUCT sections 6.1, 6.6, 8). */

export const createChannelRequestSchema = z.object({
  name: z.string().trim().max(LIMITS.maxChannelNameLength).optional(),
  ttl: z.enum(Object.keys(TTL_CHOICES) as [keyof typeof TTL_CHOICES]),
  max_participants: z.number().int().min(LIMITS.minParticipants).max(LIMITS.maxParticipants).optional(),
  mode: modeSchema.default('standard'),
})
export type CreateChannelRequest = z.infer<typeof createChannelRequestSchema>

export type CreatedChannel = {
  channel_id: string
  invite_token: string
  admin_token: string
  expires_at: string
  url: string
}

/**
 * Creates a channel and hands back the only copy of its tokens that will ever
 * exist: storage keeps hashes, so a lost invite or admin token cannot be
 * recovered, only replaced by a new channel.
 */
export async function createChannel(redis: WaveRedis, request: CreateChannelRequest): Promise<CreatedChannel> {
  const channelId = newChannelId()
  const inviteToken = newToken()
  const adminToken = newToken()
  const createdAt = epochSeconds()
  const expiresAt = expiryFrom(request.ttl, createdAt)

  const record: ChannelRecord = {
    id: channelId,
    name: request.name ?? '',
    mode: request.mode,
    created_at: createdAt,
    expires_at: expiresAt,
    max_participants: request.max_participants ?? LIMITS.defaultParticipants,
    invite_hash: hashToken(inviteToken),
    admin_hash: hashToken(adminToken),
  }

  await redis
    .multi()
    .hSet(keys.channel(channelId), serializeChannel(record))
    // Created explicitly so both counters exist from the start and carry the channel TTL.
    .set(keys.seq(channelId), '0')
    .set(keys.bytes(channelId), '0')
    .exec()
  await registerActiveChannel(redis, channelId, expiresAt)
  await applyChannelTtl(redis, channelId, expiresAt)
  await countChannelCreated(redis)

  return {
    channel_id: channelId,
    invite_token: inviteToken,
    admin_token: adminToken,
    expires_at: toIso(expiresAt),
    // The invite rides in the fragment, so it never reaches the server in a page request.
    url: `${getConfig().host}/c/${channelId}#${inviteToken}`,
  }
}

/**
 * Presence as the roster reports it. Derived from last_seen rather than read
 * from the stored state: the sweep emits the events, but a reader should not
 * see someone as active because the sweep is a minute behind. Someone who left
 * stays in the roster as gone, so the transcript and the roster agree.
 */
export function derivePresence(participant: ParticipantRecord, now: number = epochSeconds()): Presence {
  if (participant.left_at !== undefined) return 'gone'
  const silentFor = now - participant.last_seen
  if (silentFor >= PRESENCE.goneAfter) return 'gone'
  if (silentFor >= PRESENCE.idleAfter) return 'idle'
  return 'active'
}

export async function listParticipants(redis: WaveRedis, channelId: string): Promise<ParticipantRecord[]> {
  const stored = await redis.hVals(keys.parts(channelId))
  return stored.map(parseParticipant).sort((a, b) => a.joined_at - b.joined_at)
}

export function roster(participants: ParticipantRecord[], now: number = epochSeconds()): RosterEntry[] {
  return participants.map((participant) => ({
    ...toRosterEntry(participant),
    presence: derivePresence(participant, now),
  }))
}

export type ChannelView = {
  channel: {
    id: string
    name: string
    mode: ChannelRecord['mode']
    created_at: string
    expires_at: string
    max_participants: number
  }
  participants: RosterEntry[]
  last_seq: number
}

/** The public view of a channel. Token hashes never leave storage. */
export async function channelView(redis: WaveRedis, channel: ChannelRecord): Promise<ChannelView> {
  const [participants, seq] = await Promise.all([listParticipants(redis, channel.id), lastSeq(redis, channel.id)])
  return {
    channel: {
      id: channel.id,
      name: channel.name,
      mode: channel.mode,
      created_at: toIso(channel.created_at),
      expires_at: toIso(channel.expires_at),
      max_participants: channel.max_participants,
    },
    participants: roster(participants),
    last_seq: seq,
  }
}

/**
 * Closes a channel: emit the event, then delete every key it owns.
 *
 * The event is best-effort by construction. A poller checks once a second and
 * the keys are gone within milliseconds, so in practice the close is felt as a
 * 410 on the next call, which is what the agents are told to expect.
 */
export async function closeChannel(redis: WaveRedis, channel: ChannelRecord): Promise<void> {
  await appendItem(redis, channel, { type: 'system', event: 'channel.closing' })
  await forgetActiveChannel(redis, channel.id)
  await purgeChannelKeys(redis, channel.id)
}

/** Deletes every `ch:{id}*` key, idempotency keys included. SCAN, never KEYS: the server stays responsive. */
export async function purgeChannelKeys(redis: WaveRedis, channelId: string): Promise<number> {
  let deleted = 0
  for await (const batch of redis.scanIterator({ MATCH: channelKeyPattern(channelId), COUNT: 100 })) {
    if (batch.length > 0) deleted += await redis.del(batch)
  }
  return deleted
}
