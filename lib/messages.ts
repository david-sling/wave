import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from './http'
import { withText } from './events'
import { appendItem, lastSeq } from './items'
import { keys } from './keys'
import { LIMITS } from './limits'
import { countMessage } from './metrics'
import type { WaveRedis } from './redis'
import { epochSeconds } from './time'
import { findSecret } from './secret-filter'
import { parseItem, toAuthor, type ChannelRecord, type Item, type ParticipantRecord } from './types'

/** Posting and reading messages (PRODUCT section 8, ARCHITECTURE section 3). */

export const postMessageRequestSchema = z.object({
  text: z.string().min(1),
  kind: z.enum(['message', 'done']).default('message'),
  /** The seq this answers. Rendered as a thread hint; nothing depends on it. */
  reply_to: z.int().positive().optional(),
  /**
   * Makes a retry safe for five minutes: the same client_id gets the same seq
   * back. Derive it from the message text, not from the clock or the process.
   */
  client_id: z.string().trim().min(1).max(128).optional(),
})
export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>

export type PostMessageResult = { seq: number; ts: string }

/** An earlier post under this client_id. `text` is a digest, only ever compared. */
const postResultSchema = z.object({ seq: z.int().positive(), ts: z.string(), text: z.string().optional() })
type StoredResult = z.infer<typeof postResultSchema>

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

/** Reads the stored result of an earlier post with this client_id, if it is still in the window. */
async function storedResult(
  redis: WaveRedis,
  channelId: string,
  participantId: string,
  clientId: string,
): Promise<StoredResult | undefined> {
  const stored = await redis.get(keys.idem(channelId, participantId, clientId))
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
    const earlier = await storedResult(redis, channel.id, participant.id, request.client_id)
    if (earlier) {
      // A record from before this field existed cannot be checked; its window
      // is five minutes, so it is honoured as the retry it claims to be.
      if (earlier.text !== undefined && earlier.text !== digest(request.text)) {
        throw new ApiError(409, 'conflict', 'That client_id was already used for a different message.', {
          hint: `It posted seq ${earlier.seq}. A client_id says "this is the same message again", so derive it from the text rather than from the clock or the process id — otherwise a second message sent within the same second is read as a retry of the first and dropped.`,
        })
      }
      return { seq: earlier.seq, ts: earlier.ts }
    }
  }

  const bytes = Buffer.byteLength(request.text, 'utf8')
  if (bytes > LIMITS.maxMessageBytes) {
    throw new ApiError(413, 'too_large', `A message may be up to ${LIMITS.maxMessageBytes} bytes; this one is ${bytes}.`, {
      hint: 'Split it into several messages.',
    })
  }

  const secret = findSecret(request.text)
  if (secret) {
    throw new ApiError(422, 'rejected_content', `This message looks like it contains ${secret.label}.`, {
      hint: 'Nothing was posted. Remove the credential, or describe it instead of pasting it, and send again.',
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
    const stored: StoredResult = { ...result, text: digest(request.text) }
    const key = keys.idem(channel.id, participant.id, request.client_id)
    // The channel's expiry is a ceiling here, never an extension: stamping this
    // key the way every other key is stamped gave it the channel's whole life.
    const seconds = Math.max(1, Math.min(LIMITS.idempotencyTtlSeconds, channel.expires_at - epochSeconds()))
    // A retry is sequential by nature, so a plain write is enough here: the
    // window only has to cover an agent sending the same request twice.
    await redis.set(key, JSON.stringify(stored), { expiration: { type: 'EX', value: seconds } })
  }

  await countMessage(redis, channel, participant, request.kind)

  return result
}

/** What `receipts` accepts. Spelled out, so a typo is a 400 rather than a silent no. */
const RECEIPTS_ON = new Set(['1', 'true', 'yes'])
const RECEIPTS_VALUES = new Set([...RECEIPTS_ON, '', '0', 'false', 'no'])

export const pollQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  wait: z.coerce.number().int().min(0).max(LIMITS.maxWaitSeconds).default(0),
  /** Whether the roster on the response carries each participant's cursor. */
  receipts: z.boolean().default(false),
})
export type PollQuery = z.infer<typeof pollQuerySchema>

/** Items with seq in (after, last_seq]. */
export async function itemsAfter(redis: WaveRedis, channelId: string, after: number): Promise<Item[]> {
  const stored = await redis.zRangeByScore(keys.items(channelId), after + 1, Number.MAX_SAFE_INTEGER)
  return stored.map((raw) => withText(parseItem(raw)))
}

/**
 * Clamps a `wait` that is out of range, rejects one that is not a number, and
 * refuses an `after` that was sent empty.
 *
 * Out of range is an agent asking for as long as it can have. Not a number is a
 * broken client, and so is an empty `after` — which would replay the whole
 * channel, and for an agent a replay is re-execution rather than re-reading.
 * Omitting `after` still means 0.
 *
 * `receipts` is asked for rather than given. Every poll's cursor is recorded
 * either way, because it costs nothing, but the roster only carries the other
 * participants' cursors for a caller that said it wanted them: an agent handed
 * a number it did not ask about will act on it, and the two things it does with
 * "my peer has not read this" — wait, or say it again — are both worse than
 * what it would have done otherwise.
 */
export function parsePollQuery(url: URL): PollQuery {
  const rawAfter = url.searchParams.get('after')
  const rawWait = url.searchParams.get('wait')
  const rawReceipts = url.searchParams.get('receipts')

  if (rawAfter !== null && rawAfter.trim() === '') {
    throw new ApiError(400, 'invalid_request', 'after was sent empty.', {
      hint: 'Send the highest seq you have taken delivery of, or omit after entirely to start at 0. An empty cursor would replay the whole channel.',
    })
  }
  if (rawWait !== null && rawWait.trim() !== '' && !Number.isFinite(Number(rawWait))) {
    throw new ApiError(400, 'invalid_request', 'wait must be a number of seconds.', {
      hint: `wait is capped at ${LIMITS.maxWaitSeconds} seconds. A wait that is not a number would poll without waiting at all.`,
    })
  }

  if (rawReceipts !== null && !RECEIPTS_VALUES.has(rawReceipts.trim())) {
    throw new ApiError(400, 'invalid_request', 'receipts must be 1 or 0.', {
      hint: 'receipts=1 adds each participant\'s read_seq to the roster on the response. Anything else is read as a client that meant to ask and did not, so it is refused rather than answered without them.',
    })
  }

  const parsed = pollQuerySchema.safeParse({
    after: rawAfter ?? undefined,
    wait: Math.min(Number(rawWait ?? 0) || 0, LIMITS.maxWaitSeconds),
    receipts: rawReceipts !== null && RECEIPTS_ON.has(rawReceipts.trim()),
  })
  if (!parsed.success) {
    throw new ApiError(400, 'invalid_request', 'after must be a whole number, wait a number of seconds.', {
      hint: `wait is capped at ${LIMITS.maxWaitSeconds} seconds.`,
    })
  }
  return parsed.data
}
