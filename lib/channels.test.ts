import { describe, expect, it } from 'vitest'
import { fakeRedis } from '../tests/fake-redis'
import {
  glanceChannel,
  channelView,
  closeChannel,
  createChannel,
  createChannelRequestSchema,
  derivePresence,
  purgeChannelKeys,
  roster,
} from './channels'
import { appendItem } from './items'
import { keys } from './keys'
import { PRESENCE } from './limits'
import type { WaveRedis } from './redis'
import { epochSeconds } from './time'
import { hashToken, newParticipantId } from './tokens'
import { parseChannel, serializeParticipant, type ChannelRecord, type ParticipantRecord } from './types'


async function storedChannel(redis: WaveRedis, channelId: string): Promise<ChannelRecord> {
  const channel = parseChannel(await redis.hGetAll(keys.channel(channelId)))
  if (!channel) throw new Error('channel was not written')
  return channel
}

function participant(overrides: Partial<ParticipantRecord> = {}): ParticipantRecord {
  const now = epochSeconds()
  return {
    id: newParticipantId(),
    name: 'Windows agent',
    role: 'agent',
    token_hash: hashToken('token'),
    joined_at: now - 120,
    last_seen: now,
    state: 'active',
    ...overrides,
  }
}

describe('create request', () => {
  it('fills in the defaults', () => {
    const parsed = createChannelRequestSchema.parse({ ttl: '24h' })
    expect(parsed).toEqual({ ttl: '24h', mode: 'standard' })
  })

  it.each([
    ['no ttl', {}],
    ['an unknown ttl', { ttl: '30m' }],
    ['a cap below two', { ttl: '1h', max_participants: 1 }],
    ['a cap above fifty', { ttl: '1h', max_participants: 51 }],
    ['a fractional cap', { ttl: '1h', max_participants: 2.5 }],
    ['an unsupported mode', { ttl: '1h', mode: 'e2ee' }],
    ['an overlong name', { ttl: '1h', name: 'x'.repeat(61) }],
  ])('rejects %s', (_label, body) => {
    expect(createChannelRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('createChannel', () => {
  it('writes the record, the counters, and the sweep entry', async () => {
    const { redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '1h', name: 'Release 4.2', mode: 'standard' })

    const channel = await storedChannel(redis, created.channel_id)
    expect(channel.name).toBe('Release 4.2')
    expect(channel.max_participants).toBe(10)
    expect(await redis.get(keys.seq(channel.id))).toBe('0')
    expect(await redis.get(keys.bytes(channel.id))).toBe('0')
    expect(await redis.zRangeByScore(keys.activeChannels(), 0, Infinity)).toEqual([channel.id])
  })

  it('stores hashes, never the tokens', async () => {
    const { redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    const channel = await storedChannel(redis, created.channel_id)

    expect(channel.invite_hash).toBe(hashToken(created.invite_token))
    expect(channel.admin_hash).toBe(hashToken(created.admin_token))
    expect(JSON.stringify(channel)).not.toContain(created.invite_token)
    expect(JSON.stringify(channel)).not.toContain(created.admin_token)
  })

  it('puts the invite in the URL fragment, not the path', async () => {
    const { redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    expect(created.url).toBe(`https://wave.example.com/c/${created.channel_id}#${created.invite_token}`)
    expect(new URL(created.url).pathname).not.toContain(created.invite_token)
  })

  it('gives every key the channel expiry as its TTL', async () => {
    const { fake, redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '24h', mode: 'standard' })
    const channel = await storedChannel(redis, created.channel_id)

    expect(channel.expires_at - channel.created_at).toBe(86_400)
    for (const key of fake.keys().filter((key: string) => key.startsWith('ch:'))) {
      expect(fake.ttlOf(key)).toBe(channel.expires_at)
    }
  })

  it('does not reuse an ID or a token', async () => {
    const { redis } = fakeRedis()
    const first = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    const second = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    expect(first.channel_id).not.toBe(second.channel_id)
    expect(first.invite_token).not.toBe(second.invite_token)
    expect(first.admin_token).not.toBe(second.admin_token)
  })
})

describe('presence', () => {
  const now = epochSeconds()

  it('follows the thresholds in ARCHITECTURE section 5', () => {
    expect(derivePresence(participant({ last_seen: now }), now)).toBe('active')
    expect(derivePresence(participant({ last_seen: now - PRESENCE.idleAfter + 1 }), now)).toBe('active')
    expect(derivePresence(participant({ last_seen: now - PRESENCE.idleAfter }), now)).toBe('idle')
    expect(derivePresence(participant({ last_seen: now - PRESENCE.goneAfter }), now)).toBe('gone')
  })

  it('reads from last_seen, not from the state the sweep last wrote', () => {
    const stale = participant({ last_seen: now - PRESENCE.goneAfter, state: 'active' })
    expect(roster([stale], now)[0].presence).toBe('gone')
  })

  it('never exposes the token hash', () => {
    expect(Object.keys(roster([participant()], now)[0])).toEqual(['id', 'name', 'role', 'presence'])
  })
})

describe('channelView', () => {
  it('returns metadata, roster in join order, and last_seq', async () => {
    const { redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '1h', name: 'Release 4.2', mode: 'standard' })
    const channel = await storedChannel(redis, created.channel_id)

    const first = participant({ name: 'First', joined_at: epochSeconds() - 300 })
    const second = participant({ name: 'Second', joined_at: epochSeconds() - 60 })
    await redis.hSet(keys.parts(channel.id), {
      [second.id]: serializeParticipant(second),
      [first.id]: serializeParticipant(first),
    })
    await appendItem(redis, channel, { type: 'system', event: 'participant.joined' })

    const view = await channelView(redis, channel)
    expect(view.channel).toEqual({
      id: channel.id,
      name: 'Release 4.2',
      mode: 'standard',
      created_at: expect.stringMatching(/Z$/),
      expires_at: expect.stringMatching(/Z$/),
      max_participants: 10,
    })
    expect(view.participants.map((entry) => entry.name)).toEqual(['First', 'Second'])
    expect(view.last_seq).toBe(1)
  })
})

describe('closeChannel', () => {
  it('deletes every key of the channel and leaves other channels alone', async () => {
    const { fake, redis } = fakeRedis()
    const doomed = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    const survivor = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    const channel = await storedChannel(redis, doomed.channel_id)
    await redis.set(keys.idem(channel.id, 'retry-1'), '{"seq":1}')

    await closeChannel(redis, channel)

    expect(fake.keys().filter((key: string) => key.includes(doomed.channel_id))).toEqual([])
    expect(fake.keys()).toContain(keys.channel(survivor.channel_id))
    expect(await redis.zRangeByScore(keys.activeChannels(), 0, Infinity)).toEqual([survivor.channel_id])
  })

  it('purges idempotency keys too', async () => {
    const { fake, redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    await redis.set(keys.idem(created.channel_id, 'retry-1'), '{"seq":1}')
    const deleted = await purgeChannelKeys(redis, created.channel_id)
    expect(deleted).toBeGreaterThanOrEqual(4)
    expect(fake.keys().some((key: string) => key.includes(created.channel_id))).toBe(false)
  })
})

describe('glanceChannel', () => {
  it('is live, with the name, for a channel that exists, without any credential', async () => {
    const { redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '1h', name: 'Release 4.2', mode: 'standard' })
    expect(await glanceChannel(redis, created.channel_id)).toEqual({ state: 'live', name: 'Release 4.2' })
  })

  it('carries an empty name for a channel created without one', async () => {
    const { redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    expect(await glanceChannel(redis, created.channel_id)).toEqual({ state: 'live', name: '' })
  })

  it('is gone for a channel that was closed', async () => {
    const { redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    await closeChannel(redis, await storedChannel(redis, created.channel_id))
    expect(await glanceChannel(redis, created.channel_id)).toEqual({ state: 'gone' })
  })

  it('is gone for a channel past its expiry, before the sweep reaches it', async () => {
    const { redis } = fakeRedis()
    const created = await createChannel(redis, { ttl: '1h', mode: 'standard' })
    await redis.hSet(keys.channel(created.channel_id), { expires_at: String(epochSeconds() - 1) })
    expect(await glanceChannel(redis, created.channel_id)).toEqual({ state: 'gone' })
  })

  it('is gone for an ID that was never issued, malformed or not', async () => {
    const { redis } = fakeRedis()
    expect(await glanceChannel(redis, 'A'.repeat(22))).toEqual({ state: 'gone' })
    expect(await glanceChannel(redis, 'not-a-channel')).toEqual({ state: 'gone' })
  })
})
