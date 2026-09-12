import { z } from 'zod'
import { ApiError } from './http'
import { appendItem, lastSeq } from './items'
import { keys } from './keys'
import { LIMITS } from './limits'
import { applyChannelTtl, type WaveRedis } from './redis'
import { parseItem, toAuthor, type ChannelRecord, type Item, type ParticipantRecord } from './types'

/** Posting and reading messages (PRODUCT section 8, ARCHITECTURE section 3). */

export const postMessageRequestSchema = z.object({
  text: z.string().min(1),
  kind: z.enum(['message', 'done']).default('message'),
  /** The seq this answers. Rendered as a thread hint; nothing depends on it. */
  reply_to: z.int().positive().optional(),
  /** Makes a retry safe for five minutes: the same client_id gets the same seq back. */
  client_id: z.string().trim().min(1).max(128).optional(),
})
export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>

export type PostMessageResult = { seq: number; ts: string }

const postResultSchema = z.object({ seq: z.int().positive(), ts: z.string() })

/** Reads the stored result of an earlier post with this client_id, if it is still in the window. */
async function storedResult(
  redis: WaveRedis,
  channelId: string,
  clientId: string,
): Promise<PostMessageResult | undefined> {
  const stored = await redis.get(keys.idem(channelId, clientId))
  if (!stored) return undefined
  const parsed = postResultSchema.safeParse(JSON.parse(stored))
  return parsed.success ? parsed.data : undefined
}

/**
 * Appends a message from a participant.
 *
 * Order matters: the caps are checked before a sequence number is allocated, so
 * a rejected post leaves no hole in the transcript.
 */
export async function postMessage(
  redis: WaveRedis,
  channel: ChannelRecord,
  participant: ParticipantRecord,
  request: PostMessageRequest,
): Promise<PostMessageResult> {
  if (request.client_id) {
    const earlier = await storedResult(redis, channel.id, request.client_id)
    if (earlier) return earlier
  }

  const bytes = Buffer.byteLength(request.text, 'utf8')
  if (bytes > LIMITS.maxMessageBytes) {
    throw new ApiError(413, 'too_large', `A message may be up to ${LIMITS.maxMessageBytes} bytes; this one is ${bytes}.`, {
      hint: 'Split it into several messages.',
    })
  }

  const [items, channelBytes, seq] = await Promise.all([
    redis.zCard(keys.items(channel.id)),
    redis.get(keys.bytes(channel.id)),
    lastSeq(redis, channel.id),
  ])
  if (items >= LIMITS.maxItemsPerChannel) {
    throw new ApiError(413, 'too_large', `This channel has reached its limit of ${LIMITS.maxItemsPerChannel} items.`, {
      hint: 'Start a new channel to continue.',
    })
  }
  if (Number(channelBytes ?? 0) + bytes > LIMITS.maxChannelBytes) {
    throw new ApiError(413, 'too_large', 'This channel has reached its size limit.', {
      hint: 'Start a new channel to continue.',
    })
  }
  if (request.reply_to !== undefined && request.reply_to > seq) {
    throw new ApiError(400, 'invalid_request', `reply_to ${request.reply_to} is ahead of this channel.`, {
      hint: `The highest sequence number here is ${seq}.`,
    })
  }

  const item = await appendItem(redis, channel, {
    type: 'message',
    from: toAuthor(participant),
    text: request.text,
    kind: request.kind,
    ...(request.reply_to !== undefined ? { reply_to: request.reply_to } : {}),
  })
  const result: PostMessageResult = { seq: item.seq, ts: item.ts }

  if (request.client_id) {
    const key = keys.idem(channel.id, request.client_id)
    // A retry is sequential by nature, so a plain write is enough here: the
    // window only has to cover an agent sending the same request twice.
    await redis.set(key, JSON.stringify(result), { expiration: { type: 'EX', value: LIMITS.idempotencyTtlSeconds } })
    await applyChannelTtl(redis, channel.id, channel.expires_at, [key])
  }

  return result
}

export const pollQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  wait: z.coerce.number().int().min(0).max(LIMITS.maxWaitSeconds).default(0),
})
export type PollQuery = z.infer<typeof pollQuerySchema>

/** Items with seq in (after, last_seq]. */
export async function itemsAfter(redis: WaveRedis, channelId: string, after: number): Promise<Item[]> {
  const stored = await redis.zRangeByScore(keys.items(channelId), after + 1, Number.MAX_SAFE_INTEGER)
  return stored.map(parseItem)
}

/** Clamps rather than rejects: a `wait` of 300 is an agent asking for as long as it can have. */
export function parsePollQuery(url: URL): PollQuery {
  const parsed = pollQuerySchema.safeParse({
    after: url.searchParams.get('after') ?? undefined,
    wait: Math.min(Number(url.searchParams.get('wait') ?? 0) || 0, LIMITS.maxWaitSeconds),
  })
  if (!parsed.success) {
    throw new ApiError(400, 'invalid_request', 'after must be a whole number, wait a number of seconds.', {
      hint: `wait is capped at ${LIMITS.maxWaitSeconds} seconds.`,
    })
  }
  return parsed.data
}
