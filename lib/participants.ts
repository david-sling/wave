import { z } from 'zod'
import { listParticipants, roster } from './channels'
import { ApiError } from './http'
import { appendItem, lastSeq } from './items'
import { keys } from './keys'
import { LIMITS } from './limits'
import { countJoin } from './metrics'
import { applyChannelTtl, type WaveRedis } from './redis'
import { epochSeconds, toIso } from './time'
import { hashToken, newParticipantId, newToken } from './tokens'
import {
  roleSchema,
  serializeParticipant,
  toAuthor,
  type ChannelRecord,
  type ParticipantRecord,
  type RosterEntry,
} from './types'

/** Joining and leaving a channel (PRODUCT sections 6.3, 6.5, and 8). */

export const joinRequestSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.maxNameLength),
  role: roleSchema.default('agent'),
  /** Self-reported agent product. Section 14 counts the distribution; nothing else reads it. */
  client: z.string().trim().max(120).optional(),
})
export type JoinRequest = z.infer<typeof joinRequestSchema>

export type JoinResult = {
  participant_id: string
  participant_token: string
  name: string
  channel: { name: string; mode: ChannelRecord['mode']; expires_at: string; max_participants: number }
  participants: RosterEntry[]
  last_seq: number
}

/**
 * Two agents joining under one name is the normal case, not an error: their
 * humans both accepted the default. The second gets a numeric suffix, visibly,
 * so the transcript never has two identical speakers (PRODUCT 6.7).
 */
export function dedupeName(wanted: string, takenLowercase: Set<string>): string {
  if (!takenLowercase.has(wanted.toLowerCase())) return wanted
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${wanted} (${suffix})`
    if (!takenLowercase.has(candidate.toLowerCase())) return candidate
  }
}

/** Participants who have not left. The cap counts these, so a leave frees a seat. */
function present(participants: ParticipantRecord[]): ParticipantRecord[] {
  return participants.filter((participant) => participant.left_at === undefined)
}

export async function joinChannel(
  redis: WaveRedis,
  channel: ChannelRecord,
  request: JoinRequest,
): Promise<JoinResult> {
  const existing = await listParticipants(redis, channel.id)
  const cap = Math.min(channel.max_participants, LIMITS.maxParticipants)
  if (present(existing).length >= cap) {
    throw new ApiError(409, 'channel_full', `This channel is full (${cap} participants).`, {
      hint: 'Ask whoever created the channel to close it and open one with a higher cap.',
    })
  }

  const now = epochSeconds()
  const token = newToken()
  const participant: ParticipantRecord = {
    id: newParticipantId(),
    name: dedupeName(request.name, new Set(existing.map((p) => p.name.toLowerCase()))),
    role: request.role,
    token_hash: hashToken(token),
    joined_at: now,
    last_seen: now,
    state: 'active',
    ...(request.client ? { client: request.client } : {}),
  }

  await redis
    .multi()
    .hSet(keys.parts(channel.id), { [participant.id]: serializeParticipant(participant) })
    .sAdd(keys.names(channel.id), participant.name.toLowerCase())
    .exec()
  await applyChannelTtl(redis, channel.id, channel.expires_at)

  await appendItem(redis, channel, {
    type: 'system',
    event: 'participant.joined',
    subject: toAuthor(participant),
  })

  const agentsPresent = present([...existing, participant]).filter((p) => p.role === 'agent').length
  await countJoin(redis, channel, participant, agentsPresent)

  return {
    participant_id: participant.id,
    participant_token: token,
    name: participant.name,
    channel: {
      name: channel.name,
      mode: channel.mode,
      expires_at: toIso(channel.expires_at),
      max_participants: channel.max_participants,
    },
    participants: roster([...existing, participant]),
    // Read after the join event, so the joiner's first poll is not handed its own arrival.
    last_seq: await lastSeq(redis, channel.id),
  }
}

/** Writes a participant back. Every path that changes one goes through here. */
export async function saveParticipant(
  redis: WaveRedis,
  channel: ChannelRecord,
  participant: ParticipantRecord,
): Promise<void> {
  await redis.hSet(keys.parts(channel.id), { [participant.id]: serializeParticipant(participant) })
  await applyChannelTtl(redis, channel.id, channel.expires_at)
}

/**
 * Records that a participant is alive, once per request. A participant the
 * sweep had written off comes back as active and the channel is told, so the
 * others learn their peer returned rather than inferring it from a message.
 */
export async function touchParticipant(
  redis: WaveRedis,
  channel: ChannelRecord,
  participant: ParticipantRecord,
): Promise<ParticipantRecord> {
  const wasGone = participant.state === 'gone'
  const touched: ParticipantRecord = { ...participant, last_seen: epochSeconds(), state: 'active' }
  // Deliberately not saveParticipant: this runs on every poll, and the parts key
  // already carries the channel TTL from join, which HSET does not clear. Seven
  // EXPIREAT commands per poll would be the most expensive thing an idle agent does.
  await redis.hSet(keys.parts(channel.id), { [touched.id]: serializeParticipant(touched) })

  if (wasGone) {
    // The timeout marker goes with it: a participant that leaves again must be able to time out again.
    await redis.sRem(keys.emitted(channel.id), `timed_out:${participant.id}`)
    await appendItem(redis, channel, {
      type: 'system',
      event: 'participant.rejoined',
      subject: toAuthor(touched),
    })
  }

  return touched
}

/**
 * Leaving is final for that token: the participant keeps their place in the
 * transcript and the roster, but the credential stops working, so a leave is
 * not something a stray retry can undo.
 */
export async function leaveChannel(
  redis: WaveRedis,
  channel: ChannelRecord,
  participant: ParticipantRecord,
): Promise<void> {
  const departed: ParticipantRecord = { ...participant, state: 'gone', left_at: epochSeconds() }
  await saveParticipant(redis, channel, departed)
  await appendItem(redis, channel, {
    type: 'system',
    event: 'participant.left',
    subject: toAuthor(departed),
  })
}
