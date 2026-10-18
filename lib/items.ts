import { withText } from './events'
import { keys } from './keys'
import { applyChannelTtl, runScript, type WaveRedis } from './redis'
import { toIso } from './time'
import { publishWake } from './wake'
import {
  itemSchema,
  serializeItem,
  type Author,
  type ChannelRecord,
  type EventName,
  type Item,
  type MessageKind,
} from './types'

/**
 * Appending to a channel (ARCHITECTURE section 3, "Post").
 *
 * Messages and events share one sequence, so an agent polling for new
 * messages is told about joins and leaves through the same request.
 */

export type ItemDraft =
  | { type: 'message'; from: Author; text: string; kind: MessageKind; reply_to?: number }
  | { type: 'system'; event: EventName; subject?: Author }

/** The last sequence number allocated in this channel. Zero for a channel nobody has written to. */
export async function lastSeq(redis: WaveRedis, channelId: string): Promise<number> {
  const stored = await redis.get(keys.seq(channelId))
  return stored ? Number(stored) : 0
}

/** The seq of the latest message, as opposed to any item. Zero for a channel nobody has spoken in. */
export async function lastMessageSeq(redis: WaveRedis, channelId: string): Promise<number> {
  const stored = await redis.get(keys.lastMessage(channelId))
  return stored ? Number(stored) : 0
}

/**
 * Checks the item and byte caps and takes a seq and the bytes in one step, so
 * two posts landing together cannot both pass (#101). Items are never removed
 * while a channel lives, so the seq is the item count.
 * Answers the seq, -1 when the channel holds its last item, -2 when it is full.
 */
export const RESERVE_ITEM_SCRIPT = `
local seq = tonumber(redis.call('GET', KEYS[1]) or '0')
if seq >= tonumber(ARGV[1]) then return -1 end
if tonumber(redis.call('GET', KEYS[2]) or '0') + tonumber(ARGV[3]) > tonumber(ARGV[2]) then return -2 end
redis.call('INCRBY', KEYS[2], ARGV[3])
return redis.call('INCR', KEYS[1])`

export type Reservation = { seq: number; bytes: number }

/**
 * Reserves room for `bytes` more, against the item and byte caps. Undefined
 * on a store without scripting: the caller checks as before and appends
 * without a reservation, which enforces the caps less strictly.
 */
export async function reserveItem(
  redis: WaveRedis,
  channelId: string,
  bytes: number,
  caps: { maxItems: number; maxBytes: number },
): Promise<Reservation | 'items' | 'bytes' | undefined> {
  const ran = await runScript(
    redis,
    RESERVE_ITEM_SCRIPT,
    [keys.seq(channelId), keys.bytes(channelId)],
    [String(caps.maxItems), String(caps.maxBytes), String(bytes)],
  )
  if (!ran) return undefined
  const seq = Number(ran.result)
  if (seq === -1) return 'items'
  if (seq === -2) return 'bytes'
  return { seq, bytes }
}

/**
 * Allocates a sequence number, or takes the one reserved, and writes the item.
 * Size and content checks belong to the caller: by the time an item reaches
 * here it is going in.
 */
export async function appendItem(
  redis: WaveRedis,
  channel: ChannelRecord,
  draft: ItemDraft,
  reservation?: Reservation,
): Promise<Item> {
  const seq = reservation?.seq ?? (await redis.incr(keys.seq(channel.id)))
  const item = itemSchema.parse({ ...draft, seq, ts: toIso(new Date()) })
  const encoded = serializeItem(item)

  const write = redis
    .multi()
    .zAdd(keys.items(channel.id), { score: seq, value: encoded })
    .incrBy(keys.bytes(channel.id), Buffer.byteLength(encoded) - (reservation?.bytes ?? 0))
  if (item.type === 'message') write.set(keys.lastMessage(channel.id), String(seq))
  await write.exec()
  await applyChannelTtl(redis, channel.id, channel.expires_at)
  // After the write, never before: a poll woken by this must find the item and
  // not just a sequence number that has run ahead of it.
  await publishWake(redis, channel.id, seq)

  return withText(item)
}
