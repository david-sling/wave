'use server'

import { headers } from 'next/headers'
import { getAccountSession } from '@/lib/accounts/auth'
import {
  attachSeat,
  claimOwnership,
  countAccountChannels,
  forgetAccountChannel,
  listAccountChannels,
  openAccountChannel,
  ownsChannel,
  rememberMember,
  type Relation,
} from '@/lib/accounts/channels'
import { accountSecret, getPool } from '@/lib/accounts/store'
import { findParticipantByToken, loadChannel } from '@/lib/auth'
import { closeChannel } from '@/lib/channels'
import { keys } from '@/lib/keys'
import { LIMITS } from '@/lib/limits'
import { consumeLimit } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { tokenMatches } from '@/lib/tokens'
import { parseParticipant } from '@/lib/types'

/**
 * An account's channels, on every device it signs in on (ARCHITECTURE
 * section 14, "Account channels"; AUTH.md 3.6). Each action resolves the
 * account from the session and nothing else; every id the browser sends is
 * checked against that account's rows and the live channel. A channel that
 * is not the account's is answered exactly as one that does not exist.
 *
 * A signed-in browser holds no key to a channel. It reads and posts with its
 * session (lib/accounts/channel-access.ts), and its seat's token is never
 * sent to it. The invite comes from here only to be shown and shared, lives
 * in the page's memory, and authenticates nothing the page does. Signing out
 * leaves nothing behind to clean up (AUTH.md 3.6).
 *
 * With sign-in off, or signed out, each answers as if the account had no
 * channels, so the channel page can call them without asking first.
 */

export type AccountChannelSummary = { id: string; name: string; expiresAt: number; relation: Relation }

async function signedIn() {
  return getAccountSession(await headers())
}

async function underLimit(accountId: string): Promise<boolean> {
  const { allowed } = await consumeLimit(await getRedis(), {
    scope: 'account-open',
    subject: accountId,
    max: LIMITS.accountChannelOpensPerMinute,
    windowSeconds: 60,
  })
  return allowed
}

/** The account's live channels, for the pane. Ids, names, and expiries only: never a secret. */
export async function listMyChannels(): Promise<AccountChannelSummary[]> {
  const account = await signedIn()
  if (!account) return []
  const channels = await listAccountChannels(getPool(), await getRedis(), account.user.id)
  return channels.map(({ channel, relation }) => ({
    id: channel.id,
    name: channel.name,
    expiresAt: channel.expires_at * 1000,
    relation,
  }))
}

/**
 * Gives the account a channel it holds a working invite for. The invite must
 * match the live channel before anything is written, so a row exists only for
 * a channel the account was really given. Answers whether the account has it.
 */
export async function rememberChannel(channelId: string, invite: string): Promise<boolean> {
  const account = await signedIn()
  if (!account || !(await underLimit(account.user.id))) return false
  const redis = await getRedis()
  const channel = await loadChannel(redis, channelId).catch(() => null)
  if (!channel || !tokenMatches(invite, channel.invite_hash)) return false
  const pool = getPool()
  if ((await countAccountChannels(pool, account.user.id)) >= LIMITS.accountChannelsPerAccount) return false
  await rememberMember(pool, accountSecret(), account.user.id, channel, invite)
  return true
}

/** Called after the browser's first join: the seat becomes the account's, by id only. */
export async function rememberSeat(channelId: string, participantToken: string): Promise<void> {
  const account = await signedIn()
  if (!account) return
  const redis = await getRedis()
  const channel = await loadChannel(redis, channelId).catch(() => null)
  if (!channel) return
  const participant = await findParticipantByToken(redis, channel.id, participantToken)
  if (!participant || participant.left_at !== undefined) return
  await attachSeat(getPool(), account.user.id, channel.id, participant.id)
}

export type OpenedHere = {
  /** To show and share. The page never sends it: its session is its access. */
  invite: string
  relation: Relation
  /** The account's seat, when it has one. Who it is, never a key to it. */
  participant?: { id: string; name: string }
}

/** Opens one of the account's channels on this device (AUTH.md 3.6). */
export async function openHere(channelId: string): Promise<OpenedHere | null> {
  const account = await signedIn()
  if (!account || !(await underLimit(account.user.id))) return null
  const redis = await getRedis()
  const opened = await openAccountChannel(getPool(), redis, accountSecret(), account.user.id, channelId)
  if (!opened) return null
  if (!opened.participantId) return { invite: opened.invite, relation: opened.relation }

  // A seat given up stays given up: no token for a participant who left.
  const stored = await redis.hGet(keys.parts(opened.channel.id), opened.participantId)
  const seat = stored ? parseParticipant(stored) : null
  if (!seat || seat.left_at !== undefined) return { invite: opened.invite, relation: opened.relation }
  return { invite: opened.invite, relation: opened.relation, participant: { id: seat.id, name: seat.name } }
}

/** Forget everywhere, and what leaving does: the row goes, on every device. */
export async function forgetEverywhere(channelId: string): Promise<void> {
  const account = await signedIn()
  if (!account) return
  await forgetAccountChannel(getPool(), account.user.id, channelId)
}

/**
 * Closes a channel the account owns (AUTH.md 3.6). The session stands in for
 * the admin token a signed-in browser does not keep.
 */
export async function closeMyChannel(channelId: string): Promise<{ ok: true } | { error: string }> {
  const gone = { error: 'This channel is not here any more.' }
  const account = await signedIn()
  if (!account) return { error: 'Sign in first.' }
  const redis = await getRedis()
  const channel = await loadChannel(redis, channelId).catch(() => null)
  if (!channel || !(await ownsChannel(getPool(), account.user.id, channel))) return gone
  await closeChannel(redis, channel)
  await forgetAccountChannel(getPool(), account.user.id, channel.id)
  return { ok: true }
}

export type LocalChannel = { id: string; invite: string; participantToken?: string; adminToken?: string }

export type Imported = { id: string; owner: boolean }

/**
 * Moves channels this browser holds on its own into the account's profile,
 * when the person asks, so the browser can let go of their keys. Each is
 * checked like any other: one whose invite does not match its live channel is
 * left out of the answer and stays where it was, and an admin token makes the
 * account the owner only if it matches too.
 */
export async function importChannels(local: LocalChannel[]): Promise<Imported[]> {
  const imported: Imported[] = []
  for (const entry of local.slice(0, LIMITS.accountChannelsPerAccount)) {
    const account = await signedIn()
    if (!account) break
    if (!(await rememberChannel(entry.id, entry.invite))) continue
    if (entry.participantToken) await rememberSeat(entry.id, entry.participantToken)
    const owner = entry.adminToken
      ? await claimWithAdmin(account.user.id, entry.id, entry.invite, entry.adminToken)
      : false
    imported.push({ id: entry.id, owner })
  }
  return imported
}

async function claimWithAdmin(accountId: string, channelId: string, invite: string, admin: string): Promise<boolean> {
  const redis = await getRedis()
  const channel = await loadChannel(redis, channelId).catch(() => null)
  if (!channel || !tokenMatches(invite, channel.invite_hash) || !tokenMatches(admin, channel.admin_hash)) return false
  return claimOwnership(getPool(), redis, accountSecret(), accountId, channel, invite)
}
