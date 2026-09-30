'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { APIError } from 'better-auth/api'
import { getAccountSession, getAuth } from '@/lib/accounts/auth'
import { loadChannel } from '@/lib/auth'
import { rotateAdminToken as rotate } from '@/lib/channels'
import { getRedis } from '@/lib/redis'

/**
 * Sign-in and account actions (ARCHITECTURE section 14). Each resolves the
 * library from the instance configuration and does one thing; the cookie is
 * set and cleared by the library through nextCookies.
 */

const off = 'Sign-in is not available on this instance.'

export type LinkState = { sent?: string; error?: string }

/** Asks for a sign-in link. Answers the same whether or not the address has an account. */
export async function requestLink(_previous: LinkState, formData: FormData): Promise<LinkState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter an email address.' }
  const auth = getAuth()
  if (!auth) return { error: off }
  try {
    await auth.api.signInMagicLink({ body: { email }, headers: await headers() })
  } catch (error) {
    if (error instanceof APIError && error.status === 'TOO_MANY_REQUESTS') {
      return { error: 'Too many links asked for. Wait a minute and try again.' }
    }
    console.error(`sign-in link: ${error instanceof Error ? error.name : 'failed'}`)
    return { error: 'The link could not be sent. Try again in a moment.' }
  }
  return { sent: email }
}

/**
 * Exchanges the token from the link's fragment for a session. This is the
 * only caller of the library's verify endpoint: in-process, so the token is
 * never in a request URL (AUTH.md 3.2).
 */
export async function verifyLink(token: string): Promise<{ ok: true } | { error: string }> {
  const auth = getAuth()
  if (!auth) return { error: off }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return { error: 'This link is not complete.' }
  try {
    await auth.api.magicLinkVerify({ query: { token }, headers: await headers() })
  } catch {
    return { error: 'This link has been used or has expired.' }
  }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  const auth = getAuth()
  if (auth) await auth.api.signOut({ headers: await headers() })
  redirect('/')
}

export async function revokeSession(token: string): Promise<void> {
  const auth = getAuth()
  if (!auth) return
  await auth.api.revokeSession({ body: { token }, headers: await headers() })
}

export async function removePasskey(id: string): Promise<void> {
  const auth = getAuth()
  if (!auth) return
  await auth.api.deletePasskey({ body: { id }, headers: await headers() })
}

/**
 * The one thing a session grants on a channel (AUTH.md 3.6): a new admin
 * token for a channel this account owns, returned once. The old token stops
 * working at once. A channel that is not this account's is answered exactly
 * as one that does not exist.
 */
export async function rotateAdminToken(channelId: string): Promise<{ adminToken: string } | { error: string }> {
  const gone = { error: 'This channel is not here any more.' }
  const account = await getAccountSession(await headers())
  if (!account) return { error: 'Sign in first.' }
  const redis = await getRedis()
  let channel
  try {
    channel = await loadChannel(redis, channelId)
  } catch {
    return gone
  }
  if (channel.owner_id !== account.user.id) return gone
  return { adminToken: await rotate(redis, channel.id) }
}

/** Deletes the account, its sessions, and its passkeys. Its channels lose their owner and keep running. */
export async function deleteAccount(): Promise<void> {
  const auth = getAuth()
  if (!auth) return
  await auth.api.deleteUser({ body: {}, headers: await headers() })
  redirect('/')
}
