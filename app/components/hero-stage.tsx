'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Holds the hero still while the page scrolls up over it.
 *
 * The block is sticky, so the carousel and everything after it slide across
 * the headline instead of pushing it away. On the way, the block fades into
 * the ground and the ring tips over on a diagonal axis, so it reads as a disc
 * turning away rather than a picture being covered. Progress is written to a
 * CSS variable straight from the scroll handler; React never re-renders.
 */
export function HeroStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      // The hero is the first thing on the page, so the distance scrolled is
      // the distance the next block has climbed over it. It is fully gone a
      // little before it is fully covered.
      const p = Math.min(1, Math.max(0, window.scrollY / (el.offsetHeight * 0.85)))
      el.style.setProperty('--hero-p', p.toFixed(4))
      // A faded form under the gaps in the carousel must not take clicks.
      el.style.pointerEvents = p > 0.6 ? 'none' : ''
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div ref={ref} className="hero-stage sticky top-0 pb-9 pt-14 md:pt-16">
      {children}
    </div>
  )
}
