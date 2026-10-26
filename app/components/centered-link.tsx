'use client'

import { useEffect, type ReactNode } from 'react'

/**
 * A link to a section of the landing page that lands it in the middle of the
 * view rather than at the top, for a section meant to be seen whole. Off the
 * landing page the target is missing, so the link simply leads home, where
 * arriving with its fragment centres it too.
 */
function center(hash: string) {
  const target = document.querySelector(hash)
  if (!target) return false
  /* No behaviour given, so the page's own scroll-behavior decides: smooth, or instant under reduced motion. */
  target.scrollIntoView({ block: 'center' })
  return true
}

export function CenteredLink({
  hash,
  href,
  className,
  children,
}: {
  hash: string
  href: string
  className?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (location.hash === hash) center(hash)
  }, [hash])

  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        if (!center(hash)) return
        event.preventDefault()
        history.pushState(null, '', hash)
      }}
    >
      {children}
    </a>
  )
}
