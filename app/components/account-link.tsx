'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export type Who = 'off' | 'out' | 'in'
type Account = { who: Who; email: string | null }

let asked: Promise<Account> | undefined

/** One request per page load, shared by everything on the page that asks. */
function askOnce(): Promise<Account> {
  asked ??= fetch('/api/auth/get-session', { credentials: 'same-origin' })
    .then(async (response): Promise<Account> => {
      if (!response.ok) return { who: 'off', email: null }
      const body = (await response.json()) as { user?: { email?: string } } | null
      return body ? { who: 'in', email: body.user?.email ?? null } : { who: 'out', email: null }
    })
    .catch((): Account => {
      asked = undefined
      return { who: 'off', email: null }
    })
  return asked
}

/**
 * Whether this browser is signed in, and as whom, asked of the instance from
 * the browser, so the pages that ask stay prerendered: an instance without
 * sign-in answers 404 and the answer stays 'off'.
 */
export function useAccount(): Account {
  const [account, setAccount] = useState<Account>({ who: 'off', email: null })

  useEffect(() => {
    let live = true
    void askOnce().then((answer) => live && setAccount(answer))
    return () => {
      live = false
    }
  }, [])

  return account
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
