import { describe, expect, it } from 'vitest'
import { fakeRedis } from '../tests/fake-redis'
import { createChannel } from './channels'
import { keys } from './keys'
import { PRESENCE } from './limits'
import { joinChannel, saveParticipant } from './participants'
import type { WaveRedis } from './redis'
import { sweepAllChannels, sweepChannel } from './sweep'
import { epochSeconds } from './time'
import { parseChannel, parseItem, parseParticipant, type ChannelRecord } from './types'

async function openChannel(redis: WaveRedis, ttl: '1h' | '24h' = '1h'): Promise<ChannelRecord> {
  const created = await createChannel(redis, { ttl, mode: 'standard' })
  const channel = parseChannel(await redis.hGetAll(keys.channel(created.channel_id)))
  if (!channel) throw new Error('channel was not written')
  return channel
}

async function events(redis: WaveRedis, channel: ChannelRecord): Promise<string[]> {
  const raw = await redis.zRangeByScore(keys.items(channel.id), 0, Number.MAX_SAFE_INTEGER)
  return raw.map(parseItem).map((item) => (item.type === 'system' ? item.event : 'message'))
}

async function silenceParticipant(redis: WaveRedis, channel: ChannelRecord, seconds: number): Promise<void> {
  const [raw] = await redis.hVals(keys.parts(channel.id))
  const participant = parseParticipant(raw)
  await saveParticipant(redis, channel, { ...participant, last_seen: epochSeconds() - seconds })
}

describe('sweepChannel', () => {
  it('says nothing about a participant who is merely idle', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)
    await joinChannel(redis, channel, { name: 'Windows agent', role: 'agent' })
    await silenceParticipant(redis, channel, PRESENCE.idleAfter + 1)

    expect(await sweepChannel(redis, channel)).toEqual({ timed_out: 0, expiring: false })
    expect(await events(redis, channel)).toEqual(['participant.joined'])
  })

  it('times a participant out once, however many requests race', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)
    await joinChannel(redis, channel, { name: 'Windows agent', role: 'agent' })
    await silenceParticipant(redis, channel, PRESENCE.goneAfter + 1)

    const [first, ...rest] = await Promise.all([
      sweepChannel(redis, channel),
      sweepChannel(redis, channel),
      sweepChannel(redis, channel),
    ])

    expect(first.timed_out + rest.reduce((total, result) => total + result.timed_out, 0)).toBe(1)
    expect(await events(redis, channel)).toEqual(['participant.joined', 'participant.timed_out'])

    const [raw] = await redis.hVals(keys.parts(channel.id))
    expect(parseParticipant(raw).state).toBe('gone')
  })

  it('says nothing about someone who left of their own accord', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)
    await joinChannel(redis, channel, { name: 'Windows agent', role: 'agent' })
    const [raw] = await redis.hVals(keys.parts(channel.id))
    const participant = parseParticipant(raw)
    await saveParticipant(redis, channel, {
      ...participant,
      left_at: epochSeconds(),
      last_seen: epochSeconds() - PRESENCE.goneAfter - 1,
    })

    expect((await sweepChannel(redis, channel)).timed_out).toBe(0)
    expect(await events(redis, channel)).toEqual(['participant.joined'])
  })

  it('warns once inside the expiry window and not before it', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)

    const early = channel.expires_at - PRESENCE.expiringWarningBefore - 60
    expect((await sweepChannel(redis, channel, early)).expiring).toBe(false)

    const inside = channel.expires_at - PRESENCE.expiringWarningBefore + 1
    expect((await sweepChannel(redis, channel, inside)).expiring).toBe(true)
    expect((await sweepChannel(redis, channel, inside)).expiring).toBe(false)
    expect(await events(redis, channel)).toEqual(['channel.expiring'])
  })

  it('says nothing once the channel is already past its expiry', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)
    expect((await sweepChannel(redis, channel, channel.expires_at + 1)).expiring).toBe(false)
  })
})

describe('sweepAllChannels', () => {
  it('sweeps live channels and retires expired ones from the work list', async () => {
    const { redis } = fakeRedis()
    const live = await openChannel(redis, '24h')
    const expired = await openChannel(redis)
    await joinChannel(redis, live, { name: 'Windows agent', role: 'agent' })
    await silenceParticipant(redis, live, PRESENCE.goneAfter + 1)

    const totals = await sweepAllChannels(redis, expired.expires_at + 1)

    expect(totals).toEqual({ swept: 1, retired: 1, timed_out: 1, expiring: 0 })
    expect(await redis.zRangeByScore(keys.activeChannels(), 0, Number.MAX_SAFE_INTEGER)).toEqual([live.id])
  })

  it('retires a channel whose keys are already gone', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis, '24h')
    await redis.del(keys.channel(channel.id))

    expect(await sweepAllChannels(redis)).toMatchObject({ swept: 0, retired: 1 })
  })
})
