import { describe, expect, it } from 'vitest'
import { fakeRedis } from '../tests/fake-redis'
import { authenticate } from './auth'
import { issueDeviceToken, revokeDeviceToken } from './devices'
import { keys } from './keys'
import { epochSeconds } from './time'
import { hashToken, newChannelId, newParticipantId, newToken } from './tokens'
import { serializeChannel, serializeParticipant, type ChannelRecord } from './types'

async function setup() {
  const { redis } = fakeRedis()
  const now = epochSeconds()
  const channel: ChannelRecord = {
    id: newChannelId(),
    name: 'room',
    mode: 'standard',
    created_at: now,
    expires_at: now + 3_600,
    max_participants: 10,
    invite_hash: hashToken(newToken()),
    admin_hash: hashToken(newToken()),
  } as ChannelRecord
  const participantId = newParticipantId()
  await redis.hSet(keys.channel(channel.id), serializeChannel(channel))
  await redis.hSet(keys.parts(channel.id), {
    [participantId]: serializeParticipant({
      id: participantId,
      name: 'David',
      role: 'human',
      token_hash: hashToken(newToken()),
      joined_at: now,
      last_seen: now,
      state: 'active',
    }),
  })
  return { redis, channel, participantId }
}

const asBearer = (token: string) => new Request('https://wave.test', { headers: { authorization: `Bearer ${token}` } })

describe('device tokens', () => {
  it('authenticate as the seat they were issued for', async () => {
    const { redis, channel, participantId } = await setup()
    const { token } = await issueDeviceToken(redis, channel, participantId)
    const { participant } = await authenticate(redis, channel.id, 'participant', asBearer(token))
    expect(participant?.id).toBe(participantId)
  })

  it('stop working once revoked, and only that one', async () => {
    const { redis, channel, participantId } = await setup()
    const first = await issueDeviceToken(redis, channel, participantId)
    const second = await issueDeviceToken(redis, channel, participantId)
    await revokeDeviceToken(redis, channel.id, first.tokenHash)
    await expect(authenticate(redis, channel.id, 'participant', asBearer(first.token))).rejects.toMatchObject({
      status: 401,
    })
    const { participant } = await authenticate(redis, channel.id, 'participant', asBearer(second.token))
    expect(participant?.id).toBe(participantId)
  })

  it('are refused by every other channel', async () => {
    const a = await setup()
    const { token } = await issueDeviceToken(a.redis, a.channel, a.participantId)
    const other = { ...a.channel, id: newChannelId() }
    await a.redis.hSet(keys.channel(other.id), serializeChannel(other))
    await expect(authenticate(a.redis, other.id, 'participant', asBearer(token))).rejects.toMatchObject({
      status: 401,
    })
  })
})
