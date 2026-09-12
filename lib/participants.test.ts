import { describe, expect, it } from 'vitest'
import { fakeRedis } from '../tests/fake-redis'
import { channelView, createChannel } from './channels'
import { ApiError } from './http'
import { keys } from './keys'
import { dedupeName, joinChannel, joinRequestSchema, leaveChannel } from './participants'
import type { WaveRedis } from './redis'
import { parseChannel, parseItem, type ChannelRecord } from './types'

async function openChannel(redis: WaveRedis, max = 10): Promise<ChannelRecord> {
  const created = await createChannel(redis, { ttl: '1h', mode: 'standard', max_participants: max })
  const channel = parseChannel(await redis.hGetAll(keys.channel(created.channel_id)))
  if (!channel) throw new Error('channel was not written')
  return channel
}

async function items(redis: WaveRedis, channel: ChannelRecord) {
  const raw = await redis.zRangeByScore(keys.items(channel.id), 0, Number.MAX_SAFE_INTEGER)
  return raw.map(parseItem)
}

describe('join request', () => {
  it('defaults the role to agent and trims the name', () => {
    expect(joinRequestSchema.parse({ name: '  Windows agent  ' })).toEqual({
      name: 'Windows agent',
      role: 'agent',
    })
  })

  it.each([
    ['an empty name', { name: '   ' }],
    ['no name', { role: 'agent' }],
    ['a 41-character name', { name: 'x'.repeat(41) }],
    ['an unknown role', { name: 'A', role: 'observer' }],
  ])('rejects %s', (_label, body) => {
    expect(joinRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('name deduplication', () => {
  it('leaves a free name alone and suffixes a taken one', () => {
    expect(dedupeName('David agent', new Set())).toBe('David agent')
    expect(dedupeName('David agent', new Set(['david agent']))).toBe('David agent (2)')
    expect(dedupeName('David agent', new Set(['david agent', 'david agent (2)']))).toBe('David agent (3)')
  })

  it('collides on case, since the transcript reads by eye', () => {
    expect(dedupeName('DAVID AGENT', new Set(['david agent']))).toBe('DAVID AGENT (2)')
  })
})

describe('joinChannel', () => {
  it('issues a token, records the participant, and announces the arrival', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)

    const joined = await joinChannel(redis, channel, { name: 'Windows agent', role: 'agent', client: 'codex-cli' })

    expect(joined.participant_id).toMatch(/^p_/)
    expect(joined.participant_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(joined.participants).toEqual([
      { id: joined.participant_id, name: 'Windows agent', role: 'agent', presence: 'active' },
    ])

    const transcript = await items(redis, channel)
    expect(transcript).toHaveLength(1)
    expect(transcript[0]).toMatchObject({
      type: 'system',
      event: 'participant.joined',
      subject: { id: joined.participant_id, name: 'Windows agent', role: 'agent' },
    })
  })

  it('hands back a cursor past its own arrival', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)
    const joined = await joinChannel(redis, channel, { name: 'First', role: 'agent' })
    expect(joined.last_seq).toBe(1)
  })

  it('shows the second agent under a suffixed name', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)
    await joinChannel(redis, channel, { name: "David's agent", role: 'agent' })
    const second = await joinChannel(redis, channel, { name: "David's agent", role: 'agent' })

    expect(second.name).toBe("David's agent (2)")
    expect(second.participants.map((entry) => entry.name)).toEqual(["David's agent", "David's agent (2)"])
  })

  it('stores no plain token', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)
    const joined = await joinChannel(redis, channel, { name: 'Windows agent', role: 'agent' })
    const stored = await redis.hVals(keys.parts(channel.id))
    expect(stored.join()).not.toContain(joined.participant_token)
  })

  it('refuses to exceed the cap, and a leave frees the seat', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis, 2)
    const first = await joinChannel(redis, channel, { name: 'First', role: 'agent' })
    await joinChannel(redis, channel, { name: 'Second', role: 'agent' })

    await expect(joinChannel(redis, channel, { name: 'Third', role: 'agent' })).rejects.toMatchObject({
      status: 409,
      code: 'channel_full',
    })

    const participants = await redis.hVals(keys.parts(channel.id))
    const leaving = participants.map((raw) => JSON.parse(raw)).find((p) => p.id === first.participant_id)
    await leaveChannel(redis, channel, leaving)
    await expect(joinChannel(redis, channel, { name: 'Third', role: 'agent' })).resolves.toMatchObject({
      name: 'Third',
    })
  })
})

describe('leaveChannel', () => {
  it('announces the departure and leaves the roster honest', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis)
    const joined = await joinChannel(redis, channel, { name: 'Windows agent', role: 'agent' })
    const stored = (await redis.hVals(keys.parts(channel.id))).map((raw) => JSON.parse(raw))

    await leaveChannel(redis, channel, stored[0])

    const transcript = await items(redis, channel)
    expect(transcript.at(-1)).toMatchObject({ type: 'system', event: 'participant.left' })

    const view = await channelView(redis, channel)
    expect(view.participants).toEqual([
      { id: joined.participant_id, name: 'Windows agent', role: 'agent', presence: 'gone' },
    ])
  })
})

describe('errors', () => {
  it('says what to do about a full channel', async () => {
    const { redis } = fakeRedis()
    const channel = await openChannel(redis, 2)
    await joinChannel(redis, channel, { name: 'First', role: 'agent' })
    await joinChannel(redis, channel, { name: 'Second', role: 'agent' })

    const error = await joinChannel(redis, channel, { name: 'Third', role: 'agent' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toContain('2 participants')
    expect((error as ApiError).hint).toBeTruthy()
  })
})
