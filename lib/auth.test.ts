import { describe, expect, it } from 'vitest'
import { authenticate, bearerToken } from './auth'
import { ApiError } from './http'
import { keys } from './keys'
import type { WaveRedis } from './redis'
import { epochSeconds } from './time'
import { hashToken, newChannelId, newParticipantId, newToken } from './tokens'
import { serializeChannel, serializeParticipant, type ChannelRecord, type ParticipantRecord } from './types'

/** Just enough Redis for the auth helper: the two reads it makes. */
function fakeRedis(hashes: Record<string, Record<string, string>>): WaveRedis {
  return {
    hGetAll: async (key: string) => hashes[key] ?? {},
    hVals: async (key: string) => Object.values(hashes[key] ?? {}),
  } as unknown as WaveRedis
}

type Channel = {
  id: string
  invite: string
  admin: string
  participant: string
  participantId: string
  record: ChannelRecord
  participantRecord: ParticipantRecord
}

function buildChannel(expiresAt = epochSeconds() + 3_600): Channel {
  const id = newChannelId()
  const invite = newToken()
  const admin = newToken()
  const participant = newToken()
  const participantId = newParticipantId()
  return {
    id,
    invite,
    admin,
    participant,
    participantId,
    record: {
      id,
      name: 'Release 4.2',
      mode: 'standard',
      created_at: epochSeconds() - 60,
      expires_at: expiresAt,
      max_participants: 10,
      invite_hash: hashToken(invite),
      admin_hash: hashToken(admin),
    },
    participantRecord: {
      id: participantId,
      name: 'Windows agent',
      role: 'agent',
      token_hash: hashToken(participant),
      joined_at: epochSeconds() - 30,
      last_seen: epochSeconds(),
      state: 'active',
    },
  }
}

function storeOf(...channels: Channel[]): WaveRedis {
  const hashes: Record<string, Record<string, string>> = {}
  for (const channel of channels) {
    hashes[keys.channel(channel.id)] = serializeChannel(channel.record)
    hashes[keys.parts(channel.id)] = {
      [channel.participantId]: serializeParticipant(channel.participantRecord),
    }
  }
  return fakeRedis(hashes)
}

function get(token?: string): Request {
  return new Request('https://wave.example.com/api/v1/channels/x', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise
    return 200
  } catch (error) {
    if (error instanceof ApiError) return error.status
    throw error
  }
}

describe('bearerToken', () => {
  it('reads the Authorization header', () => {
    expect(bearerToken(get('abc'))).toBe('abc')
  })

  it('accepts any casing of the scheme', () => {
    const request = new Request('https://wave.example.com/', { headers: { authorization: 'bearer abc' } })
    expect(bearerToken(request)).toBe('abc')
  })

  it.each([
    ['no header', undefined],
    ['another scheme', 'Basic abc'],
    ['an empty token', 'Bearer '],
  ])('returns nothing for %s', (_label, header) => {
    const request = new Request('https://wave.example.com/', { headers: header ? { authorization: header } : {} })
    expect(bearerToken(request)).toBeUndefined()
  })

  it('never reads a token from the query string', () => {
    const request = new Request('https://wave.example.com/api/v1/channels/x/messages?token=leaked')
    expect(bearerToken(request)).toBeUndefined()
  })
})

describe('authenticate', () => {
  it('accepts the invite token', async () => {
    const channel = buildChannel()
    const context = await authenticate(storeOf(channel), channel.id, 'invite', get(channel.invite))
    expect(context.channel.id).toBe(channel.id)
    expect(context.participant).toBeUndefined()
  })

  it('accepts the admin token', async () => {
    const channel = buildChannel()
    const context = await authenticate(storeOf(channel), channel.id, 'admin', get(channel.admin))
    expect(context.channel.id).toBe(channel.id)
  })

  it('accepts a participant token and returns that participant', async () => {
    const channel = buildChannel()
    const context = await authenticate(storeOf(channel), channel.id, 'participant', get(channel.participant))
    expect(context.participant?.id).toBe(channel.participantId)
  })

  it('does not let one credential stand in for another', async () => {
    const channel = buildChannel()
    const redis = storeOf(channel)
    expect(await statusOf(authenticate(redis, channel.id, 'invite', get(channel.admin)))).toBe(401)
    expect(await statusOf(authenticate(redis, channel.id, 'admin', get(channel.invite)))).toBe(401)
    expect(await statusOf(authenticate(redis, channel.id, 'participant', get(channel.invite)))).toBe(401)
    expect(await statusOf(authenticate(redis, channel.id, 'invite', get(channel.participant)))).toBe(401)
  })

  it('rejects every credential of another channel', async () => {
    const a = buildChannel()
    const b = buildChannel()
    const redis = storeOf(a, b)
    expect(await statusOf(authenticate(redis, b.id, 'invite', get(a.invite)))).toBe(401)
    expect(await statusOf(authenticate(redis, b.id, 'admin', get(a.admin)))).toBe(401)
    expect(await statusOf(authenticate(redis, b.id, 'participant', get(a.participant)))).toBe(401)
  })

  it('rejects a request with no token', async () => {
    const channel = buildChannel()
    expect(await statusOf(authenticate(storeOf(channel), channel.id, 'invite', get()))).toBe(401)
  })

  it('treats the channel ID alone as worthless', async () => {
    const channel = buildChannel()
    expect(await statusOf(authenticate(storeOf(channel), channel.id, 'invite', get(channel.id)))).toBe(401)
  })

  it('returns 410 for an unknown or malformed channel, whatever the token', async () => {
    const channel = buildChannel()
    const redis = storeOf(channel)
    expect(await statusOf(authenticate(redis, newChannelId(), 'invite', get(channel.invite)))).toBe(410)
    expect(await statusOf(authenticate(redis, 'not-a-channel-id', 'invite', get(channel.invite)))).toBe(410)
  })

  it('returns 410 for an expired channel before checking the token', async () => {
    const channel = buildChannel(epochSeconds() - 1)
    const redis = storeOf(channel)
    expect(await statusOf(authenticate(redis, channel.id, 'invite', get(channel.invite)))).toBe(410)
    expect(await statusOf(authenticate(redis, channel.id, 'invite', get('wrong')))).toBe(410)
  })
})
