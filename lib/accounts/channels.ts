import type { Pool } from 'pg'
import { revokeDeviceToken } from '../devices.ts'
import { keys } from '../keys.ts'
import type { WaveRedis } from '../redis.ts'
import { epochSeconds } from '../time.ts'
import { tokenMatches } from '../tokens.ts'
import { parseChannel, type ChannelRecord } from '../types.ts'
import { sealInvite, unsealInvite } from './seal.ts'

export { ACCOUNT_TABLES_SQL } from './schema.ts'

/**
 * The channels an account created or joined (ARCHITECTURE section 14,
 * "Account channels"). One row per account and channel in `account_channel`;
 * Redis stays the source of truth for whether a channel is live, so a row
 * whose channel is gone is dropped the next time it is read, and expired rows
 * are pruned by the sweep (AUTH.md 4.3). Every function takes the account id
 * from its caller, which has it from the session, never from the browser.
 */

export type Relation = 'owner' | 'member'

export type AccountChannel = { channel: ChannelRecord; relation: Relation; createdAt: Date }

type Row = {
  channel_id: string
  relation: Relation
  participant_id: string | null
  invite_sealed: string | null
  created_at: Date
}

/** A channel the account just created, with the invite it was handed. */
export async function rememberOwner(
  pool: Pool,
  secret: string,
  accountId: string,
  channelId: string,
  expiresAt: number,
  invite: string,
): Promise<void> {
  await pool.query(
    `insert into account_channel (account_id, channel_id, relation, invite_sealed, expires_at)
     values ($1, $2, 'owner', $3, to_timestamp($4))
     on conflict (account_id, channel_id) do update set relation = 'owner', invite_sealed = excluded.invite_sealed`,
    [accountId, channelId, sealInvite(secret, accountId, channelId, invite), expiresAt],
  )
}

/**
 * A channel the account opened with a working invite. The caller has checked
 * the invite against the live channel. An owner row stays an owner row, and
 * gains the invite if it was carried over from the first release without one.
 */
export async function rememberMember(
  pool: Pool,
  secret: string,
  accountId: string,
  channel: ChannelRecord,
  invite: string,
): Promise<void> {
  await pool.query(
    `insert into account_channel (account_id, channel_id, relation, invite_sealed, expires_at)
     values ($1, $2, 'member', $3, to_timestamp($4))
     on conflict (account_id, channel_id) do update
       set invite_sealed = coalesce(account_channel.invite_sealed, excluded.invite_sealed)`,
    [accountId, channel.id, sealInvite(secret, accountId, channel.id, invite), channel.expires_at],
  )
}

/** The account's seat, once it has one. Only the id: the token is never stored. */
export async function attachSeat(
  pool: Pool,
  accountId: string,
  channelId: string,
  participantId: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update account_channel set participant_id = $3 where account_id = $1 and channel_id = $2`,
    [accountId, channelId, participantId],
  )
  return (rowCount ?? 0) > 0
}

/**
 * Live channels, newest first. Rows whose channel is gone are deleted on the
 * way. A row with no invite (one carried over from owned_channel) cannot be
 * opened anywhere, so it is not listed until a browser brings the invite.
 */
export async function listAccountChannels(pool: Pool, redis: WaveRedis, accountId: string): Promise<AccountChannel[]> {
  const { rows } = await pool.query<Row>(
    `select channel_id, relation, participant_id, invite_sealed, created_at from account_channel
     where account_id = $1 and expires_at > now() and invite_sealed is not null
     order by created_at desc`,
    [accountId],
  )
  const live: AccountChannel[] = []
  const gone: string[] = []
  const now = epochSeconds()
  for (const row of rows) {
    const channel = parseChannel(await redis.hGetAll(keys.channel(row.channel_id)))
    if (channel && channel.expires_at > now) {
      live.push({ channel, relation: row.relation, createdAt: row.created_at })
    } else {
      gone.push(row.channel_id)
    }
  }
  if (gone.length > 0) {
    await pool.query(`delete from account_channel where account_id = $1 and channel_id = any($2)`, [accountId, gone])
  }
  return live
}

export type Opened = { channel: ChannelRecord; invite: string; participantId: string | null; relation: Relation }

/**
 * What a session may take to open a channel here (AUTH.md 3.6, 3.12): the
 * row must be this account's, the channel live, and the unsealed invite must
 * still match the channel's. Anything else is null, the same as no channel.
 */
export async function openAccountChannel(
  pool: Pool,
  redis: WaveRedis,
  secret: string,
  accountId: string,
  channelId: string,
): Promise<Opened | null> {
  const { rows } = await pool.query<Row>(
    `select channel_id, relation, participant_id, invite_sealed, created_at from account_channel
     where account_id = $1 and channel_id = $2 and expires_at > now()`,
    [accountId, channelId],
  )
  const row = rows[0]
  if (!row?.invite_sealed) return null
  const channel = parseChannel(await redis.hGetAll(keys.channel(channelId)))
  if (!channel || channel.expires_at <= epochSeconds()) return null
  const invite = unsealInvite(secret, accountId, channelId, row.invite_sealed)
  if (!invite || !tokenMatches(invite, channel.invite_hash)) return null
  return { channel, invite, participantId: row.participant_id, relation: row.relation }
}

/** Whether the account owns the channel: its owner row, and the owner on the live record. */
export async function ownsChannel(pool: Pool, accountId: string, channel: ChannelRecord): Promise<boolean> {
  if (channel.owner_id !== accountId) return false
  const { rowCount } = await pool.query(
    `select 1 from account_channel where account_id = $1 and channel_id = $2 and relation = 'owner'`,
    [accountId, channel.id],
  )
  return (rowCount ?? 0) > 0
}

/** Live rows of either kind, for the per-account cap. */
export async function countAccountChannels(pool: Pool, accountId: string, relation?: Relation): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from account_channel
     where account_id = $1 and expires_at > now() and ($2::text is null or relation = $2)`,
    [accountId, relation ?? null],
  )
  return Number(rows[0]?.n ?? 0)
}

/** Forget everywhere, or the seat was given up: the row goes. An owner keeps owner_id on the channel. */
export async function forgetAccountChannel(pool: Pool, accountId: string, channelId: string): Promise<void> {
  await pool.query(`delete from account_channel where account_id = $1 and channel_id = $2`, [accountId, channelId])
}

/** The sweep's share: rows whose channel has expired on its own. */
export async function pruneAccountChannels(pool: Pool): Promise<number> {
  const channels = await pool.query(`delete from account_channel where expires_at <= now()`)
  await pool.query(`delete from account_device where expires_at <= now()`)
  return channels.rowCount ?? 0
}

/**
 * Before an account is deleted: its channels lose their owner and keep
 * running on their admin tokens (AUTH.md 4.4), and its rows go. Its device
 * tokens go with its sessions.
 */
export async function disownChannels(pool: Pool, redis: WaveRedis, accountId: string): Promise<void> {
  const { rows } = await pool.query<{ channel_id: string; relation: Relation }>(
    `delete from account_channel where account_id = $1 returning channel_id, relation`,
    [accountId],
  )
  for (const row of rows) {
    if (row.relation === 'owner') await redis.hDel(keys.channel(row.channel_id), 'owner_id')
  }
}

/** How many device tokens one session keeps for one channel: one per open tab, within reason. */
export const DEVICE_TOKENS_PER_SESSION_CHANNEL = 5

/**
 * Records a device token a session took for a channel. Each open tab takes
 * its own, since the page keeps it in memory only; past the cap, the oldest
 * are withdrawn first.
 */
export async function recordDevice(
  pool: Pool,
  redis: WaveRedis,
  sessionId: string,
  channel: ChannelRecord,
  tokenHash: string,
): Promise<void> {
  await pool.query(
    `insert into account_device (session_id, channel_id, token_hash, expires_at)
     values ($1, $2, $3, to_timestamp($4)) on conflict do nothing`,
    [sessionId, channel.id, tokenHash, channel.expires_at],
  )
  const { rows } = await pool.query<{ token_hash: string }>(
    `delete from account_device where session_id = $1 and channel_id = $2 and token_hash in (
       select token_hash from account_device where session_id = $1 and channel_id = $2
       order by created_at desc offset $3
     ) returning token_hash`,
    [sessionId, channel.id, DEVICE_TOKENS_PER_SESSION_CHANNEL],
  )
  for (const row of rows) await revokeDeviceToken(redis, channel.id, row.token_hash)
}

/** A session ended: every device token it took stops working at once (AUTH.md 3.6). */
export async function revokeSessionDevices(pool: Pool, redis: WaveRedis, sessionId: string): Promise<void> {
  const { rows } = await pool.query<{ channel_id: string; token_hash: string }>(
    `delete from account_device where session_id = $1 returning channel_id, token_hash`,
    [sessionId],
  )
  for (const row of rows) await revokeDeviceToken(redis, row.channel_id, row.token_hash)
}
