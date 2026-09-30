'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { verifyLink } from '@/app/account/actions'

/**
 * Reads the token out of the fragment, drops it from the address bar before
 * anything else can see it, and exchanges it once. A link opened twice, or
 * after five minutes, lands on the failure text with the way back.
 */
export function VerifyLink() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // Exactly once per mount: the token is single-use, and the first run
    // clears it from the address bar, so a second run would find nothing and
    // report a link that in fact worked.
    if (started.current) return
    started.current = true
    const token = window.location.hash.slice(1)
    window.history.replaceState(null, '', window.location.pathname)
    const outcome = token ? verifyLink(token) : Promise.resolve({ error: 'This link is not complete.' })
    void outcome.then((result) => {
      if ('ok' in result) router.replace('/account')
      else setError(result.error)
    })
  }, [router])

  if (error) {
    return (
      <div className="grid gap-3">
        <p className="m-0 text-[15px] font-semibold">That link did not work</p>
        <p className="m-0 text-[15px] text-ink-2">{error}</p>
        <Link href="/signin" className="link w-fit text-[14px]">
          Ask for a new one
        </Link>
      </div>
    )
  }
  return (
    <p className="m-0 text-[15px] text-ink-2" role="status" aria-live="polite">
      Signing you in…
    </p>
  )
}
