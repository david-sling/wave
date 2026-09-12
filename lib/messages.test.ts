import { describe, expect, it } from 'vitest'
import { fakeRedis } from '../tests/fake-redis'
import { createChannel } from './channels'
import { ApiError } from './http'
import { keys } from './keys'
import { LIMITS } from './limits'
import { itemsAfter, parsePollQuery, postMessage, postMessageRequestSchema } from './messages'
import { joinChannel } from './participants'
import type { WaveRedis } from './redis'
import { parseChannel, parseParticipant, type ChannelRecord, type ParticipantRecord } from './types'

async function channelWithParticipant(
  redis: WaveRedis,
): Promise<{ channel: ChannelRecord; participant: ParticipantRecord }> {
  const created = await createChannel(redis, { ttl: '1h', mode: 'standard' })
  const channel = parseChannel(await redis.hGetAll(keys.channel(created.channel_id)))
  if (!channel) throw new Error('channel was not written')
  await joinChannel(redis, channel, { name: 'Windows agent', role: 'agent' })
  const [raw] = await redis.hVals(keys.parts(channel.id))
  return { channel, participant: parseParticipant(raw) }
}

describe('post request', () => {
  it('defaults the kind to message', () => {
    expect(postMessageRequestSchema.parse({ text: 'hello' })).toEqual({ text: 'hello', kind: 'message' })
  })

  it.each([
    ['empty text', { text: '' }],
    ['no text', { kind: 'done' }],
    ['an unknown kind', { text: 'hi', kind: 'shout' }],
    ['a reply_to of zero', { text: 'hi', reply_to: 0 }],
    ['a fractional reply_to', { text: 'hi', reply_to: 1.5 }],
  ])('rejects %s', (_label, body) => {
    expect(postMessageRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('postMessage', () => {
  it('appends the message and returns its place in the transcript', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)

    const result = await postMessage(redis, channel, participant, { text: 'Build passes.', kind: 'message' })

    expect(result.seq).toBe(2)
    expect(result.ts).toMatch(/Z$/)
    const [item] = await itemsAfter(redis, channel.id, 1)
    expect(item).toMatchObject({
      type: 'message',
      text: 'Build passes.',
      kind: 'message',
      from: { id: participant.id, name: 'Windows agent', role: 'agent' },
    })
  })

  it('keeps the byte counter in step with what was written', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)
    const before = Number(await redis.get(keys.bytes(channel.id)))
    await postMessage(redis, channel, participant, { text: 'hello', kind: 'message' })
    expect(Number(await redis.get(keys.bytes(channel.id)))).toBeGreaterThan(before)
  })

  it('gives a retry the same seq back, and a different client_id a new one', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)
    const body = { text: 'only once', kind: 'message' as const, client_id: 'retry-1' }

    const first = await postMessage(redis, channel, participant, body)
    const retry = await postMessage(redis, channel, participant, body)
    const other = await postMessage(redis, channel, participant, { ...body, client_id: 'retry-2' })

    expect(retry).toEqual(first)
    expect(other.seq).toBe(first.seq + 1)
    expect(await itemsAfter(redis, channel.id, 1)).toHaveLength(2)
  })

  it('refuses a message over the size limit without consuming a seq', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)
    const oversized = 'x'.repeat(LIMITS.maxMessageBytes + 1)

    await expect(postMessage(redis, channel, participant, { text: oversized, kind: 'message' })).rejects.toMatchObject({
      status: 413,
      code: 'too_large',
    })
    expect(await redis.get(keys.seq(channel.id))).toBe('1')
  })

  it('counts the size in bytes, not characters', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)
    // Four bytes each, so half the limit in characters is twice the limit in bytes.
    const emoji = '🌊'.repeat(LIMITS.maxMessageBytes / 2)

    await expect(postMessage(redis, channel, participant, { text: emoji, kind: 'message' })).rejects.toMatchObject({
      status: 413,
    })
  })

  it('refuses once the channel is full of items', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)
    for (let seq = 0; seq < LIMITS.maxItemsPerChannel; seq += 1) {
      await redis.zAdd(keys.items(channel.id), { score: seq + 100, value: `filler-${seq}` })
    }

    const error = await postMessage(redis, channel, participant, { text: 'one too many', kind: 'message' }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(413)
    expect((error as ApiError).hint).toContain('new channel')
  })

  it('refuses a reply to a message that does not exist yet', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)

    await expect(
      postMessage(redis, channel, participant, { text: 'answering the future', kind: 'message', reply_to: 99 }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('keeps a reply_to that points at a real item', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)
    await postMessage(redis, channel, participant, { text: 'first', kind: 'message' })
    await postMessage(redis, channel, participant, { text: 'second', kind: 'message', reply_to: 2 })

    const items = await itemsAfter(redis, channel.id, 2)
    expect(items[0]).toMatchObject({ reply_to: 2 })
  })
})

describe('poll query', () => {
  const parse = (query: string) => parsePollQuery(new URL(`https://wave.example.com/x${query}`))

  it('defaults to the whole channel and no waiting', () => {
    expect(parse('')).toEqual({ after: 0, wait: 0 })
  })

  it('reads after and wait', () => {
    expect(parse('?after=12&wait=50')).toEqual({ after: 12, wait: 50 })
  })

  it('clamps a wait beyond the cap rather than failing the call', () => {
    expect(parse('?wait=300').wait).toBe(LIMITS.maxWaitSeconds)
  })

  it('rejects nonsense', () => {
    expect(() => parse('?after=-1')).toThrow(ApiError)
    expect(() => parse('?after=abc')).toThrow(ApiError)
  })
})

describe('itemsAfter', () => {
  it('returns only what the caller has not seen, in order', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)
    await postMessage(redis, channel, participant, { text: 'one', kind: 'message' })
    await postMessage(redis, channel, participant, { text: 'two', kind: 'message' })

    expect((await itemsAfter(redis, channel.id, 0)).map((item) => item.seq)).toEqual([1, 2, 3])
    expect((await itemsAfter(redis, channel.id, 2)).map((item) => item.seq)).toEqual([3])
    expect(await itemsAfter(redis, channel.id, 3)).toEqual([])
  })
})

describe('the secret filter on post', () => {
  it('refuses a message carrying a credential, and posts nothing', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)

    const error = await postMessage(redis, channel, participant, {
      text: 'here is the key: -----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n',
      kind: 'message',
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).code).toBe('rejected_content')
    expect((error as ApiError).message).toContain('private key block')
    expect((error as ApiError).hint).toMatch(/Nothing was posted/)
    expect(await redis.get(keys.seq(channel.id))).toBe('1')
  })

  it('never repeats the rejected text back', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)
    // Assembled rather than written out, so the repository holds nothing a scanner would flag.
    const secret = `gh${'p'}_${'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'}`

    const error = (await postMessage(redis, channel, participant, {
      text: `token is ${secret}`,
      kind: 'message',
    }).catch((e: unknown) => e)) as ApiError

    expect(JSON.stringify(error.message + error.hint)).not.toContain(secret)
  })

  it('lets ordinary code through', async () => {
    const { redis } = fakeRedis()
    const { channel, participant } = await channelWithParticipant(redis)
    const code = 'The fix is `const key = process.env.OPENAI_API_KEY` in lib/config.ts'

    await expect(postMessage(redis, channel, participant, { text: code, kind: 'message' })).resolves.toMatchObject({
      seq: 2,
    })
  })
})
