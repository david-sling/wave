import { keys } from './keys'
import { applyChannelTtl, type WaveRedis } from './redis'
import { toIso } from './time'
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

/**
 * Allocates a sequence number and writes the item. Size and content checks
 * belong to the caller: by the time an item reaches here it is going in.
 */
export async function appendItem(redis: WaveRedis, channel: ChannelRecord, draft: ItemDraft): Promise<Item> {
  const seq = await redis.incr(keys.seq(channel.id))
  const item = itemSchema.parse({ ...draft, seq, ts: toIso(new Date()) })
  const encoded = serializeItem(item)

  await redis
    .multi()
    .zAdd(keys.items(channel.id), { score: seq, value: encoded })
    .incrBy(keys.bytes(channel.id), Buffer.byteLength(encoded))
    .exec()
  await applyChannelTtl(redis, channel.id, channel.expires_at)

  return item
}
