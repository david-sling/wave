'use server'

import { headers } from 'next/headers'
import { getAccountSession } from '@/lib/accounts/auth'
import {
  attachSeat,
  countAccountChannels,
  forgetAccountChannel,
  listAccountChannels,
  openAccountChannel,
  recordDevice,
  rememberMember,
  type Relation,
} from '@/lib/accounts/channels'
import { accountSecret, getPool } from '@/lib/accounts/store'
import { findParticipantByToken, loadChannel } from '@/lib/auth'
import { issueDeviceToken } from '@/lib/devices'
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
 * Called by the channel page once a signed-in browser holds a working invite.
 * The invite must match the live channel before anything is written, so a row
 * exists only for a channel the account was really given.
 */
export async function rememberChannel(channelId: string, invite: string): Promise<void> {
  const account = await signedIn()
  if (!account || !(await underLimit(account.user.id))) return
  const redis = await getRedis()
  const channel = await loadChannel(redis, channelId).catch(() => null)
  if (!channel || !tokenMatches(invite, channel.invite_hash)) return
  const pool = getPool()
  if ((await countAccountChannels(pool, account.user.id)) >= LIMITS.accountChannelsPerAccount) return
  await rememberMember(pool, accountSecret(), account.user.id, channel, invite)
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
  invite: string
  /** Present when the account has a seat: a fresh device token for it, bound to this session. */
  participant?: { id: string; token: string; name: string }
}

/**
 * Opens one of the account's channels on this device (AUTH.md 3.6): the
 * invite back, and a device token for the account's seat when it has one.
 */
export async function openHere(channelId: string): Promise<OpenedHere | null> {
  const account = await signedIn()
  if (!account || !(await underLimit(account.user.id))) return null
  const redis = await getRedis()
  const opened = await openAccountChannel(getPool(), redis, accountSecret(), account.user.id, channelId)
  if (!opened) return null
  if (!opened.participantId) return { invite: opened.invite }

  // A seat given up stays given up: no token for a participant who left.
  const stored = await redis.hGet(keys.parts(opened.channel.id), opened.participantId)
  const seat = stored ? parseParticipant(stored) : null
  if (!seat || seat.left_at !== undefined) return { invite: opened.invite }
  const { token, tokenHash } = await issueDeviceToken(redis, opened.channel, seat.id)
  await recordDevice(getPool(), redis, account.session.id, opened.channel, tokenHash)
  return { invite: opened.invite, participant: { id: seat.id, token, name: seat.name } }
}

/** Forget everywhere, and what leaving does: the row goes, on every device. */
export async function forgetEverywhere(channelId: string): Promise<void> {
  const account = await signedIn()
  if (!account) return
  await forgetAccountChannel(getPool(), account.user.id, channelId)
}
