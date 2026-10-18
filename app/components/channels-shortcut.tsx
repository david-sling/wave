'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { live } from '@/lib/visited-channels'
import { useAccount } from './account-link'
import { unreadOf, useUnreadVersion } from './channel/use-unread'
import { useVisitedChannels } from './channel/use-visited-channels'

/**
 * The way back to your channels from any page that is not one, once this
 * browser has opened any. Pages that carry the channels pane already show
 * them, so it stays off there.
 */
export function ChannelsShortcut() {
  const pathname = usePathname()
  const { who } = useAccount()
  const stored = useVisitedChannels()
  useUnreadVersion()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const rooms = live(stored, now)
  const withPane = pathname === '/c' || pathname.startsWith('/c/') || pathname === '/account'
  // Signed in, the nav's View channels already leads there.
  if (withPane || who === 'in' || rooms.length === 0) return null
  const unread = rooms.some((room) => unreadOf(room.id, now) === 'unread')

  return (
    <Link
      href="/c"
      className="btn btn-sm btn-secondary fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 shadow-lift sm:right-6 sm:bottom-6"
    >
      <b aria-hidden className="font-bold text-ink-3">
        #
      </b>
      Your channels
      <span className="text-ink-3">{rooms.length}</span>
      {unread ? (
        <>
          <span aria-hidden className="size-1.5 rounded-full bg-ink" />
          <span className="sr-only">, some unread</span>
        </>
      ) : null}
    </Link>
  )
}
