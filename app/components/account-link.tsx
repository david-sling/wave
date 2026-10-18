'use client'

import Link from 'next/link'
import { useEffect, useSyncExternalStore } from 'react'

export type Who = 'off' | 'out' | 'in'
/** `name` is the account's own, empty until it is given one. */
export type Account = { who: Who; email: string | null; name: string | null }

const OFF: Account = { who: 'off', email: null, name: null }
let asked: Promise<Account> | undefined
let current: Account = OFF
const listeners = new Set<() => void>()

function publish(next: Account) {
  current = next
  for (const listener of listeners) listener()
}

/** One request per page load, shared by everything on the page that asks. */
function askOnce(): Promise<Account> {
  asked ??= fetch('/api/auth/get-session', { credentials: 'same-origin' })
    .then(async (response): Promise<Account> => {
      if (!response.ok) return OFF
      const body = (await response.json()) as { user?: { email?: string; name?: string } } | null
      if (!body) return { who: 'out', email: null, name: null }
      return { who: 'in', email: body.user?.email ?? null, name: body.user?.name?.trim() || null }
    })
    .then((answer) => {
      publish(answer)
      return answer
    })
    .catch((): Account => {
      asked = undefined
      return OFF
    })
  return asked
}

/** After the account's name changes on this page, so everything showing it agrees. */
export function rememberAccountName(name: string) {
  asked = Promise.resolve({ ...current, name })
  publish({ ...current, name })
}

/**
 * Whether this browser is signed in, as whom, and under what name, asked of
 * the instance from the browser, so the pages that ask stay prerendered: an
 * instance without sign-in answers 404 and the answer stays 'off'.
 */
export function useAccount(): Account {
  useEffect(() => {
    void askOnce()
  }, [])
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => current,
    () => OFF,
  )
}

/** For code outside React that needs the same answer. */
export const accountState = askOnce

/** The one link sign-in adds to the nav, absent on an instance without it. */
export function AccountLink({ className = '' }: { className?: string }) {
  const { who } = useAccount()
  if (who === 'off') return null
  return (
    <Link href={who === 'in' ? '/account' : '/signin'} className={`no-underline hover:text-ink ${className}`}>
      {who === 'in' ? 'Account' : 'Sign in'}
    </Link>
  )
}

/**
 * The nav's one action. Signed out it makes a channel, through the create
 * form every page with the nav carries; signed in, the person is back for
 * the channels they already have, so it leads to them.
 */
export function NavAction() {
  const { who } = useAccount()
  if (who === 'in') {
    return (
      <Link href="/c" className="btn btn-primary btn-sm">
        View channels
      </Link>
    )
  }
  return (
    <a href="#create" className="btn btn-primary btn-sm">
      Create a channel
    </a>
  )
}
