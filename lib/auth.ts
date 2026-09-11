import { gone, unauthorized } from './http'
import { keys } from './keys'
import type { WaveRedis } from './redis'
import { epochSeconds } from './time'
import { isChannelId, tokenMatches } from './tokens'
import { parseChannel, parseParticipant, type ChannelRecord, type ParticipantRecord } from './types'

/**
 * Authentication for every route (ARCHITECTURE section 3).
 *
 * The channel ID identifies a channel; it never grants access to one. Access
 * comes from a bearer token, read only from the Authorization header, hashed
 * and compared in constant time against the hash stored for the credential
 * type the route expects.
 */

export type CredentialType = 'invite' | 'participant' | 'admin'

export type AuthContext = {
  channel: ChannelRecord
  /** Present only for the participant credential. */
  participant?: ParticipantRecord
}

/** Reads the bearer token. Query strings are never consulted: secrets do not belong in URLs. */
export function bearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization')
  if (!header) return undefined
  const [scheme, ...rest] = header.trim().split(/\s+/)
  if (scheme.toLowerCase() !== 'bearer') return undefined
  const token = rest.join('')
  return token.length > 0 ? token : undefined
}

/** Loads a live channel. A missing, malformed, or expired ID is all the same 410. */
export async function loadChannel(redis: WaveRedis, channelId: string): Promise<ChannelRecord> {
  if (!isChannelId(channelId)) throw gone()
  const channel = parseChannel(await redis.hGetAll(keys.channel(channelId)))
  if (!channel) throw gone()
  if (channel.expires_at <= epochSeconds()) throw gone()
  return channel
}

async function findParticipantByToken(
  redis: WaveRedis,
  channelId: string,
  token: string,
): Promise<ParticipantRecord | undefined> {
  const stored = await redis.hVals(keys.parts(channelId))
  for (const raw of stored) {
    const participant = parseParticipant(raw)
    if (tokenMatches(token, participant.token_hash)) return participant
  }
  return undefined
}

/**
 * Resolves the channel and verifies the presented credential.
 *
 * Throws 410 when the channel is gone, 401 when the token is missing or does
 * not match the expected credential for that channel. A token from another
 * channel fails here, because every hash checked is read from this channel's
 * own keys.
 */
export async function authenticate(
  redis: WaveRedis,
  channelId: string,
  expected: CredentialType,
  request: Request,
): Promise<AuthContext> {
  const channel = await loadChannel(redis, channelId)
  const token = bearerToken(request)
  if (!token) throw unauthorized('Missing Authorization: Bearer <token> header.')

  if (expected === 'invite') {
    if (!tokenMatches(token, channel.invite_hash)) throw unauthorized('Invalid invite token for this channel.')
    return { channel }
  }

  if (expected === 'admin') {
    if (!tokenMatches(token, channel.admin_hash)) throw unauthorized('Invalid admin token for this channel.')
    return { channel }
  }

  const participant = await findParticipantByToken(redis, channel.id, token)
  if (!participant) throw unauthorized('Invalid participant token for this channel.')
  return { channel, participant }
}
