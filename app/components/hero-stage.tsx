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
 *
 * The ring's spin follows the scroll, so it would stop dead when the scroll
 * does. Instead the ring rides the scroll exactly while it moves, and the
 * first frame it does not, the ring is let go at the speed it was turning: it
 * runs on, slows, and a soft spring brings it back to where the seats were
 * placed, clear of the headline. Scrolling again takes it back up, any offset
 * it is still carrying fading out as it does.
 */

/** Degrees the ring spins per unit of progress: `--hero-p * 55deg` in globals.css. */
const TURN = 55
/**
 * The run-on: the spring's stiffness and damping once let go, how fast a
 * leftover offset fades while riding the scroll, in seconds, and the fastest it
 * will be let go at, in degrees a second, so a jump (an anchor, a restored
 * scroll) cannot fling it.
 */
const COAST = { stiffness: 3, damping: 3.5, fade: 0.15, fastest: 300 }

export function HeroStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    let last = 0
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let turn = 0 // where the scroll has the ring, in degrees
    let speed = 0 // how fast the scroll is turning it, smoothed, degrees a second
    let offset = 0 // how far the ring is from where the scroll has it
    let drift = 0 // the offset's speed once let go
    let free = false

    const progress = () => {
      // The hero is the first thing on the page, so the distance scrolled is
      // the distance the next block has climbed over it. It is fully gone a
      // little before it is fully covered.
      const p = Math.min(1, Math.max(0, window.scrollY / (el.offsetHeight * 0.85)))
      el.style.setProperty('--hero-p', p.toFixed(4))
      // A faded form under the gaps in the carousel must not take clicks.
      el.style.pointerEvents = p > 0.6 ? 'none' : ''
      return p
    }

    const tick = (now: number) => {
      frame = 0
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const moved = progress() * TURN - turn
      turn += moved
      if (still) return
      if (moved !== 0) {
        free = false
        speed = speed * 0.5 + (moved / dt) * 0.5
        offset *= Math.exp(-dt / COAST.fade)
      } else {
        if (!free) {
          free = true
          drift = Math.max(-COAST.fastest, Math.min(COAST.fastest, speed))
          speed = 0
        }
        const k = COAST.stiffness
        drift += (-k * offset - COAST.damping * drift) * dt
        offset += drift * dt
      }
      el.style.setProperty('--ring-coast', `${offset.toFixed(2)}deg`)
      if (free && Math.abs(offset) < 0.05 && Math.abs(drift) < 0.5) {
        offset = 0
        drift = 0
        el.style.setProperty('--ring-coast', '0deg')
        return
      }
      frame = requestAnimationFrame(tick)
    }
    // Stick where it already stands, under the nav, so the hero does not
    // first slide up into the top of the screen before it holds.
    const pin = () => {
      el.style.top = `${el.parentElement!.getBoundingClientRect().top + window.scrollY}px`
    }
    const onResize = () => {
      pin()
      onScroll()
    }
    const onScroll = () => {
      if (frame) return
      // A frame's worth back, so the first step's speed is not divided by nothing.
      last = performance.now() - 16
      frame = requestAnimationFrame(tick)
    }
    pin()
    turn = progress() * TURN
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div ref={ref} className="hero-stage sticky pb-9 pt-14 md:pt-16">
      {children}
    </div>
  )
}
