'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export type Who = 'off' | 'out' | 'in'

/**
 * Whether this browser is signed in, and as whom, asked of the instance once
 * from the browser, so the pages that ask stay prerendered: an instance
 * without sign-in answers 404 and the answer stays 'off'.
 */
export function useAccount(): { who: Who; email: string | null } {
  const [account, setAccount] = useState<{ who: Who; email: string | null }>({ who: 'off', email: null })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/get-session', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const body = (await response.json()) as { user?: { email?: string } } | null
        setAccount(body ? { who: 'in', email: body.user?.email ?? null } : { who: 'out', email: null })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  return account
}

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
