'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Who = 'off' | 'out' | 'in'

/**
 * The one link sign-in adds to the nav. It asks the instance once, from the
 * browser, so the pages that carry the nav stay prerendered: an instance
 * without sign-in answers 404 and the link is simply absent.
 */
export function AccountLink({ className = '' }: { className?: string }) {
  const [who, setWho] = useState<Who>('off')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/get-session', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        setWho((await response.json()) ? 'in' : 'out')
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  if (who === 'off') return null
  return (
    <Link href={who === 'in' ? '/account' : '/signin'} className={`no-underline hover:text-ink ${className}`}>
      {who === 'in' ? 'Account' : 'Sign in'}
    </Link>
  )
}
