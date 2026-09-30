import type { Pool } from 'pg'
import { keys } from '../keys.ts'
import type { WaveRedis } from '../redis.ts'
import { epochSeconds } from '../time.ts'
import { parseChannel, type ChannelRecord } from '../types.ts'

export { OWNED_CHANNEL_TABLE_SQL } from './schema.ts'

/**
 * The channels an account owns (ARCHITECTURE section 14, "Ownership").
 *
 * One table, `owned_channel`, is the account's index into Redis. Redis stays
 * the source of truth for whether a channel is live: a row whose channel is
 * gone is dropped the next time it is read, and expired rows are pruned by
 * the sweep, so the list is bounded (AUTH.md 4.3). Nothing about a channel
 * beyond its id and expiry is stored here.
 */

export type OwnedChannel = { channel: ChannelRecord; createdAt: Date }

export async function rememberOwnedChannel(
  pool: Pool,
  accountId: string,
  channelId: string,
  expiresAt: number,
): Promise<void> {
  await pool.query(
    `insert into owned_channel (account_id, channel_id, expires_at) values ($1, $2, to_timestamp($3))
     on conflict do nothing`,
    [accountId, channelId, expiresAt],
  )
}

/** Live channels owned, newest first. Rows whose channel is gone are deleted on the way. */
export async function listOwnedChannels(pool: Pool, redis: WaveRedis, accountId: string): Promise<OwnedChannel[]> {
  const { rows } = await pool.query<{ channel_id: string; created_at: Date }>(
    `select channel_id, created_at from owned_channel
     where account_id = $1 and expires_at > now() order by created_at desc`,
    [accountId],
  )
  const live: OwnedChannel[] = []
  const gone: string[] = []
  const now = epochSeconds()
  for (const row of rows) {
    const channel = parseChannel(await redis.hGetAll(keys.channel(row.channel_id)))
    if (channel && channel.expires_at > now && channel.owner_id === accountId) {
      live.push({ channel, createdAt: row.created_at })
    } else {
      gone.push(row.channel_id)
    }
  }
  if (gone.length > 0) {
    await pool.query(`delete from owned_channel where account_id = $1 and channel_id = any($2)`, [accountId, gone])
  }
  return live
}

/** Rows not yet past their expiry. An upper bound on live channels, cheap enough to check on every create. */
export async function countOwnedChannels(pool: Pool, accountId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from owned_channel where account_id = $1 and expires_at > now()`,
    [accountId],
  )
  return Number(rows[0]?.n ?? 0)
}

/** The sweep's share: rows whose channel has expired on its own. */
export async function pruneOwnedChannels(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(`delete from owned_channel where expires_at <= now()`)
  return rowCount ?? 0
}

/**
 * Before an account is deleted: its channels lose their owner and keep
 * running on their admin tokens (AUTH.md 4.4).
 */
export async function disownChannels(pool: Pool, redis: WaveRedis, accountId: string): Promise<void> {
  const { rows } = await pool.query<{ channel_id: string }>(
    `delete from owned_channel where account_id = $1 returning channel_id`,
    [accountId],
  )
  for (const row of rows) await redis.hDel(keys.channel(row.channel_id), 'owner_id')
}
