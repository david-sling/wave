'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Holds the hero still while the page scrolls up over it.
 *
 * The block is sticky, so the carousel and everything after it slide across
 * the headline instead of pushing it away. On the way, the words fade from the
 * outside in and the ring tips over, so it reads as a disc turning away rather
 * than a picture being covered. The ring does not fade: the stage stays stuck
 * past the end of the hero, until the steps section has climbed over all of
 * it, and the ring is hidden behind it from there. Progress is written to a CSS variable straight from the scroll
 * handler; React never re-renders.
 *
 * The ring's spin follows the scroll, so it would stop dead when the scroll
 * does. Instead the ring rides the scroll exactly while it moves, and the
 * first frame it does not, the ring is let go at the speed it was turning: it
 * runs on, slows, and a soft spring brings it back to where the seats were
 * placed, clear of the headline. Scrolling again takes it back up, any offset
 * it is still carrying fading out as it does.
 */

/** Degrees the ring spins over its whole run: `--ring-p * 120deg` in globals.css. */
const TURN = 120
/**
 * The run-on: the spring's stiffness and damping once let go, how fast a
 * leftover offset fades while riding the scroll, in seconds, and the fastest it
 * will be let go at, in degrees a second, so a jump (an anchor, a restored
 * scroll) cannot fling it.
 */
const COAST = { stiffness: 3, damping: 3.5, fade: 0.15, fastest: 300 }
/**
 * How quickly the ring's lean catches up, in seconds: with the pointer while it
 * moves over the hero, and slower back to flat once it leaves, so letting go
 * reads as the ring settling rather than jumping back.
 */
const LEAN = { follow: 0.18, release: 0.6 }
/**
 * How far the words bulge by the end of the fade, as a share of their block's
 * shorter side. Negative, so the middle is drawn from farther out than it
 * stands and sinks away from the reader, like the inside of a bowl; positive
 * would swell it toward them.
 */
const BULGE = -0.55
/** How much more blurred the words are by the end of the fade, in pixels. */
const BLUR = 4

/**
 * The bulge's displacement map: red and green carry how far, across and down,
 * each point is drawn from toward the middle. Most in the middle of the block,
 * none at its rim, so the edge of the lens does not tear. One map pixel to each
 * pixel of the words: a smaller map, stretched, moves them in blocks, and the
 * glyphs break up into steps.
 */
function bulgeMap(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context || !width || !height) return ''
  const image = context.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = ((x + 0.5) / width) * 2 - 1
      const ny = ((y + 0.5) / height) * 2 - 1
      const pull = Math.max(0, 1 - nx * nx - ny * ny)
      const i = (y * width + x) * 4
      image.data[i] = 127.5 * (1 - nx * pull)
      image.data[i + 1] = 127.5 * (1 - ny * pull)
      image.data[i + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

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
    let aimX = 0 // where the pointer would have the lean, -1 to 1 each way
    let aimY = 0
    let leanX = 0 // where the lean is
    let leanY = 0
    let leanFrame = 0
    let held = false // whether the pointer is over the hero
    let leanLast = 0
    const ring = el.querySelector<HTMLElement>('[data-ring]')
    const steps = document.getElementById('how')
    const copy = el.querySelector<HTMLElement>('[data-hero-copy]')
    const bulge = el.querySelector('feDisplacementMap')
    const blur = el.querySelector('feGaussianBlur')
    const map = el.querySelector('feImage')
    // The bulge is a filter redrawn over every word each frame, too much for a
    // phone to do while it scrolls; there the words only fade. A computer that
    // starts dropping frames under it lets it go too (see `tick`).
    let lens = !still && matchMedia('(pointer: fine)').matches
    let slow = 0 // recent frames that ran long while the bulge was on
    // Sizes, measured when the layout changes rather than on every frame, so a
    // scroll never waits on layout.
    let stageHeight = 0
    let copySide = 0
    let mapSize = ''
    let reach = 0 // how far down the page the steps start

    const progress = () => {
      // The hero is the first thing on the page, so the distance scrolled is
      // the distance the next block has climbed over it. The words take a
      // little longer than that to go, so the softened fade has room to read.
      const p = stageHeight ? Math.min(1, Math.max(0, window.scrollY / (stageHeight * 1.1))) : 0
      el.style.setProperty('--hero-p', p.toFixed(4))
      // The words bulge as they go. Off at rest, so they stay crisp.
      if (lens && copy && bulge) {
        // Only while the words are on screen and going: none at rest, so they
        // stay crisp, and none once they have gone.
        copy.style.filter = p > 0 && p < 1 ? 'url(#hero-bulge)' : ''
        bulge.setAttribute('scale', (p * BULGE * copySide).toFixed(2))
        // Softer as they go, so the bulge's stair-steps never show and the
        // words dissolve rather than just thin out.
        blur?.setAttribute('stdDeviation', (1 + p * BLUR).toFixed(2))
      } else if (copy && !still) {
        // Without the bulge (a phone, or a computer that could not keep up),
        // the blur alone: a plain CSS blur on the words' own layer, which the
        // GPU applies without repainting them.
        copy.style.filter = p > 0 && p < 1 ? `blur(${(p * BLUR).toFixed(2)}px)` : ''
      }
      // A faded form under the gaps in the carousel must not take clicks.
      el.style.pointerEvents = p > 0.6 ? 'none' : ''
      // Nor lean toward a pointer it no longer hears leave.
      if (p > 0.6 && (aimX || aimY)) lean(0, 0)
      // The ring turns for longer: all the way until the steps fill the
      // screen, where it is behind them and must not show below them as they
      // leave.
      const ringP = reach > 0 ? Math.min(1, Math.max(0, window.scrollY / reach)) : p
      el.style.setProperty('--ring-p', ringP.toFixed(4))
      if (ring) {
        ring.style.visibility = ringP >= 1 ? 'hidden' : ''
        ring.toggleAttribute('data-turning', ringP > 0)
      }
      return ringP
    }

    const tick = (now: number) => {
      frame = 0
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const moved = progress() * TURN - turn
      turn += moved
      if (still) return
      // Scrolling with the bulge on and frames running long (under 36 a
      // second): a dozen more slow than smooth, and the words just fade.
      if (lens && moved !== 0 && copy?.style.filter) {
        slow = dt > 1 / 36 ? slow + 1 : Math.max(0, slow - 1)
        if (slow > 12) {
          lens = false
          copy.style.filter = ''
        }
      }
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
      stageHeight = el.offsetHeight
      reach = steps ? steps.getBoundingClientRect().top + window.scrollY : 0
      if (!copy) return
      const [width, height] = [copy.offsetWidth, copy.offsetHeight]
      copySide = Math.min(width, height)
      // The map lies over the words, in their own unscaled pixels. Drawn again
      // only when they change size, not each time a phone's toolbar slides.
      if (map && lens && mapSize !== `${width}x${height}`) {
        mapSize = `${width}x${height}`
        map.setAttribute('width', `${width}`)
        map.setAttribute('height', `${height}`)
        map.setAttribute('href', bulgeMap(width, height))
      }
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
    // The side of the ring under the pointer leans away from it, as if pressed.
    // Measured across the words rather than the whole stage, so it leans
    // fully by their edges instead of barely moving over them.
    // Eased here, every frame toward wherever the pointer is now, so it
    // follows as the pointer moves rather than waiting for it to stop.
    const leanStep = (now: number) => {
      const step = 1 - Math.exp(-Math.min(0.05, (now - leanLast) / 1000) / (held ? LEAN.follow : LEAN.release))
      leanLast = now
      leanX += (aimX - leanX) * step
      leanY += (aimY - leanY) * step
      const settled = Math.abs(aimX - leanX) < 0.002 && Math.abs(aimY - leanY) < 0.002
      if (settled) {
        leanX = aimX
        leanY = aimY
      }
      el.style.setProperty('--lean-x', leanX.toFixed(3))
      el.style.setProperty('--lean-y', leanY.toFixed(3))
      leanFrame = settled ? 0 : requestAnimationFrame(leanStep)
    }
    const lean = (x: number, y: number, over = false) => {
      held = over
      aimX = x
      aimY = y
      if (leanFrame) return
      leanLast = performance.now() - 16
      leanFrame = requestAnimationFrame(leanStep)
    }
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const box = (el.querySelector('[data-hero-copy]') ?? el).getBoundingClientRect()
      const along = (at: number, from: number, size: number) => Math.max(-1, Math.min(1, ((at - from) / size) * 2 - 1))
      lean(along(event.clientX, box.left, box.width), along(event.clientY, box.top, box.height), true)
    }
    const onLeave = () => lean(0, 0)
    pin()
    turn = progress() * TURN
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    // The fonts arriving, or anything else that moves the steps, re-measures.
    const watch = new ResizeObserver(onResize)
    watch.observe(el.parentElement!)
    if (!still) {
      el.addEventListener('pointermove', onPointer)
      el.addEventListener('pointerleave', onLeave)
    }
    return () => {
      el.removeEventListener('pointermove', onPointer)
      el.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(leanFrame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      watch.disconnect()
    }
  }, [])

  return (
    <div ref={ref} className="hero-stage sticky mx-auto w-full max-w-6xl px-6 pb-9 pt-14 md:pt-16">
      {children}
      <svg aria-hidden className="absolute size-0">
        <filter id="hero-bulge" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feImage x="0" y="0" preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" />
          {/* The displacement samples without smoothing; blur takes the stair-steps off the glyphs. */}
          <feGaussianBlur stdDeviation="1" />
        </filter>
      </svg>
    </div>
  )
}
