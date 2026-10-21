'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { APIError } from 'better-auth/api'
import { getAuth } from '@/lib/accounts/auth'
import { joinRequestSchema } from '@/lib/participants'

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

/**
 * Ends one of this account's sessions, named by its id. The token it is
 * revoked by is looked up here and never leaves the server: bound action
 * arguments are written into the page, and a token there is readable by any
 * script on it, which is what the HttpOnly cookie exists to prevent.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  const auth = getAuth()
  if (!auth) return
  const requestHeaders = await headers()
  const sessions = await auth.api.listSessions({ headers: requestHeaders })
  const session = sessions.find((candidate) => candidate.id === sessionId)
  if (!session) return
  await auth.api.revokeSession({ body: { token: session.token }, headers: requestHeaders })
}

/**
 * The account's name: the one it joins channels under, so it is asked once
 * rather than in every room. Held to the same rules as a name given at join.
 */
export async function setMyName(name: string): Promise<{ name: string } | { error: string }> {
  const auth = getAuth()
  if (!auth) return { error: off }
  const parsed = joinRequestSchema.shape.name.safeParse(name)
  if (!parsed.success) return { error: 'Use a name of 1 to 40 characters.' }
  await auth.api.updateUser({ body: { name: parsed.data }, headers: await headers() })
  return { name: parsed.data }
}

export async function removePasskey(id: string): Promise<void> {
  const auth = getAuth()
  if (!auth) return
  await auth.api.deletePasskey({ body: { id }, headers: await headers() })
}

/** Deletes the account, its sessions, and its passkeys. Its channels lose their owner and keep running. */
export async function deleteAccount(): Promise<void> {
  const auth = getAuth()
  if (!auth) return
  await auth.api.deleteUser({ body: {}, headers: await headers() })
  redirect('/')
}
