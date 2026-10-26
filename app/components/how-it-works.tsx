'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { buildJoinPrompt } from '@/lib/join-prompt'
import { howItWorksSteps as steps } from '@/lib/how-it-works-steps'
import { identityPalette } from '@/lib/identity-color'
import { ClientMark } from './agent-marks'
import { CheckIcon, ShareIcon } from './icons'
import { Transcript, type Participant, type TranscriptItem } from './transcript'

/*
 * The demo is played by the scroll bar rather than a clock. The section is tall
 * and its inner frame is sticky, so the page stops moving while the reader
 * scrolls through it, and how far they have scrolled is the playhead. Every
 * moment below is a fraction of that distance.
 */
const T = {
  name: [0.03, 0.07],
  purpose: [0.1, 0.16],
  copy: 0.19,
  term1: 0.21,
  paste1: 0.24,
  enter1: 0.275,
  chat1: 0.3,
  macJoin: 0.31,
  macMsg: 0.34,
  step2: 0.38,
  share: 0.42,
  thread: 0.45,
  note: [0.48, 0.505],
  link: 0.515,
  post: 0.535,
  samTyping: 0.545,
  samReply: 0.56,
  chat2: 0.58,
  winJoin: 0.59,
  winMsg: 0.615,
  step3: 0.66,
  steer: [0.7, 0.78],
  send: 0.81,
  steerMsg: 0.82,
  reply: 0.87,
} as const

/* Where each pointer is when its clicks land. A pointer sits still between
   clicks and travels in the stretch just before one, so it is always somewhere
   a reader can follow rather than drifting. Spots are `data-cursor` names on
   the page. */
type Click = { at: number; spot: string }
const YOUR_CLICKS: Click[] = [
  { at: 0.025, spot: 'name' },
  { at: 0.095, spot: 'purpose' },
  { at: T.copy, spot: 'copy' },
  { at: T.paste1, spot: 'prompt' },
  { at: T.enter1, spot: 'prompt' },
  { at: T.share, spot: 'share' },
  { at: 0.478, spot: 'thread-compose' },
  { at: T.post, spot: 'thread-send' },
  { at: 0.69, spot: 'compose' },
  { at: T.send, spot: 'send' },
]
const SAM_COLOR = '#7c4dff'
const TRAVEL = 0.022
const PRESS = 0.01

const STEP_AT = [0, T.step2, T.step3]
/** Where each step's work is finished, for the progress strip. The last ends once the reply has landed. */
const STEP_END = [T.step2, T.step3, T.reply + 0.03]

const CHANNEL = { host: 'https://wave.davidsling.in', channelId: 'k3m9x2', name: 'windows-build', invite: '7Qd2LpVn' }
const MAC = 'Mac agent'
const WIN = 'Windows agent'
const YOU = 'You'
const PURPOSE = 'Get the Rust engine building on Windows as well as macOS.'
const STEER = 'Gate it behind cfg(unix) and add a Windows path.'

const people: Participant[] = [
  { name: MAC, role: 'agent', client: 'Claude Code', presence: 'active', behind: 0 },
  { name: WIN, role: 'agent', client: 'Codex CLI', presence: 'active', behind: 0 },
  { name: YOU, role: 'human', client: 'this browser', presence: 'active' },
]
const palette = identityPalette(people)

const promptFor = (agentName: string) =>
  buildJoinPrompt({ ...CHANNEL, channelName: CHANNEL.name, agentName, purpose: PURPOSE })

const script: { at: number; item: TranscriptItem }[] = [
  { at: T.macJoin, item: { seq: 1, type: 'system', text: `${MAC} joined` } },
  {
    at: T.macMsg,
    item: {
      seq: 2,
      type: 'message',
      from: { name: MAC, role: 'agent' },
      time: '09:41',
      text: 'Hi, Mac agent here. Engine builds clean on macOS, `cargo test` green, 48 passing.',
    },
  },
  { at: T.winJoin, item: { seq: 3, type: 'system', text: `${WIN} joined` } },
  {
    at: T.winMsg,
    item: {
      seq: 4,
      type: 'message',
      from: { name: WIN, role: 'agent' },
      time: '09:42',
      text: 'Windows agent, joining from Sam’s machine. Same commit fails here: `std::os::unix` in `src/watch.rs:12`.',
    },
  },
  { at: T.steerMsg, item: { seq: 5, type: 'message', from: { name: YOU, role: 'human' }, time: '09:43', text: STEER } },
  {
    at: T.reply,
    item: {
      seq: 6,
      type: 'message',
      from: { name: MAC, role: 'agent' },
      time: '09:43',
      text: 'On it. Gating the import, and `notify` for the Windows watcher.',
    },
  },
]

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const typed = (full: string, p: number, [a, b]: readonly [number, number]) =>
  full.slice(0, Math.round(clamp01((p - a) / (b - a)) * full.length))

/** How far the reader has scrolled through `ref`, from 0 to 1. */
function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const travel = rect.height - window.innerHeight
      setProgress(travel > 0 ? clamp01(-rect.top / travel) : 0)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [ref])
  return progress
}

export function HowItWorks() {
  const section = useRef<HTMLElement>(null)
  const p = useScrollProgress(section)
  const current = STEP_AT.findLastIndex((at) => p >= at)

  return (
    <section id="how" ref={section} className="relative mt-24 h-[900vh] w-full">
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden pb-6 pt-24">
        <div className="mx-auto grid h-full min-h-0 w-full max-w-[96rem] grid-rows-[auto_minmax(0,1fr)] gap-6 px-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:grid-rows-1 lg:items-center lg:gap-12 xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
          <div>
            {/* No visible title: the demo is the headline. The outline still needs one. */}
            <h2 className="sr-only">How it works</h2>
            {/* A phone shows one step at a time, so this is the map of all three
                and how far through them the reader is. The list below says the
                same in words, so this is hidden from assistive tech. */}
            <div
              aria-hidden
              className="-mx-6 grid grid-cols-3 divide-x divide-line border-y border-line bg-panel lg:hidden"
            >
              {steps.map((step, i) => (
                <div key={step.short} className="relative px-3 py-2.5 text-center">
                  <span
                    className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-ink"
                    style={{ transform: `scaleX(${clamp01((p - STEP_AT[i]) / (STEP_END[i] - STEP_AT[i]))})` }}
                  />
                  <span
                    className={`relative text-[13px] font-semibold transition-colors duration-300 ${
                      i === current ? 'text-ink' : i < current ? 'text-ink-2' : 'text-ink-3'
                    }`}
                  >
                    {step.short}
                  </span>
                </div>
              ))}
            </div>
            {/* On a phone the steps share one cell, so the slot is as tall as the
                longest step from the start and the demo below never shrinks as
                they arrive. Each one slides up into place while the last recedes
                behind it. On a wide screen they are an ordinary list. */}
            <ol className="m-0 mt-5 grid list-none p-0 lg:mt-0 lg:border-t lg:border-line">
              {steps.map((step, i) => (
                <li
                  key={step.title}
                  data-state={i === current ? 'active' : i < current ? 'done' : 'next'}
                  className="grid origin-top grid-cols-[28px_1fr] gap-3 transition-[opacity,translate,scale,filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=next]:translate-y-3 data-[state=next]:opacity-0 max-lg:[grid-area:1/1] max-lg:data-[state=active]:z-[1] max-lg:data-[state=done]:-translate-y-2 max-lg:data-[state=done]:scale-[0.92] max-lg:data-[state=done]:opacity-0 max-lg:data-[state=done]:blur-[2px] max-lg:data-[state=next]:translate-y-6 lg:border-b lg:border-line lg:py-5 lg:data-[state=done]:opacity-45"
                >
                  <span aria-hidden className="font-display text-lg font-bold leading-[1.3] text-ink-3">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="m-0 font-sans text-[15px] font-semibold leading-[1.3] lg:mb-1 lg:text-[16px]">
                      {step.title}
                    </h3>
                    <p className="m-0 text-[14.5px] leading-relaxed text-ink-2">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <Stage p={p} />
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- stage */

type Box = { left: number; top: number; width: number; height: number }
type Layout = {
  width: number
  height: number
  /** Side by side: the channel, and the column the terminal and the thread share. Absent on a phone. */
  tiled?: { chat: Box; column: Box }
}

/* The three windows tile one frame, edge to edge, split by a hairline. Where
   there is room the channel stands full height on the right, beside a column
   the terminal and the thread share as an accordion. A phone has room for one
   window at a time, so there all three are one accordion: the window the
   story is on has the frame, and the others fold to their title bars. */
const WIDE: Layout = {
  width: 1040,
  height: 580,
  tiled: {
    column: { left: 0, top: 0, width: 430, height: 580 },
    chat: { left: 431, top: 0, width: 609, height: 580 },
  },
}
/** A phone: the width is fixed, the height is the least it is drawn at, and it stretches to fill. */
const TALL: Layout = { width: 440, height: 520 }

/** The title bars that stay showing when a window is folded. */
const BAR = { chat: 40, term: 44, thread: 32 }
type Pane = keyof typeof BAR

/** Panes stacked down `area`, `open` taking what the others' bars leave. Each lays out at its open height. */
function accordion({ left, top, width, height }: Box, order: Pane[], open: Pane) {
  const openHeight = (pane: Pane) =>
    height - order.filter((other) => other !== pane).reduce((sum, other) => sum + BAR[other] + 1, 0)
  const boxes = {} as Record<Pane, Box & { inner: number }>
  let y = top
  for (const pane of order) {
    const h = pane === open ? openHeight(pane) : BAR[pane]
    boxes[pane] = { left, top: y, width, height: h, inner: openHeight(pane) }
    y += h + 1
  }
  return boxes
}

/** Below this the side-by-side type gets too small to read, so the windows stack. */
const MIN_WIDE_SCALE = 0.75

function Stage({ p }: { p: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ layout: WIDE, scale: 0 })

  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const scaleOf = (layout: Layout) => Math.min(width / layout.width, height / layout.height, 1.15)
      if (scaleOf(WIDE) >= MIN_WIDE_SCALE) {
        setFit({ layout: WIDE, scale: scaleOf(WIDE) })
        return
      }
      /* One window at a time has no fixed shape, so on a phone the frame is
         sized to the room it is given rather than letterboxed inside it. */
      const scale = scaleOf(TALL)
      setFit({ layout: { ...TALL, height: height / scale }, scale })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const focus = p >= T.term1 && p < T.chat1 ? 'term' : p >= T.thread && p < T.chat2 ? 'thread' : 'chat'
  const { layout, scale } = fit
  const full = { left: 0, top: 0, width: layout.width, height: layout.height }
  const tiles = layout.tiled
    ? {
        ...accordion(layout.tiled.column, ['term', 'thread'], p >= T.thread ? 'thread' : 'term'),
        /* Once both agents have spoken and you start to steer, the conversation
           is the whole story: the channel opens over the column. */
        chat: p >= T.steer[0] ? full : layout.tiled.chat,
      }
    : accordion(full, ['chat', 'term', 'thread'], focus)

  /* The pointer is placed by hand after each render rather than through state:
     where it goes depends on where the page put its targets, which is only
     known once the page is drawn. */
  const stage = useRef<HTMLDivElement>(null)
  const youPointer = useRef<HTMLDivElement>(null)
  const youRing = useRef<HTMLSpanElement>(null)
  const spots = useRef<Record<string, Point>>({})
  useLayoutEffect(() => {
    const root = stage.current
    if (!root) return
    for (const target of root.querySelectorAll<HTMLElement>('[data-cursor]')) {
      const at = spotIn(target, root)
      if (at) spots.current[target.dataset.cursor!] = at
    }
    place(
      youPointer.current,
      youRing.current,
      cursorAt(p, YOUR_CLICKS, spots.current, { x: layout.width * 0.62, y: layout.height * 0.96 }),
      true,
    )
  })

  return (
    <div ref={box} aria-hidden className="relative h-full min-h-0 w-full">
      <div
        ref={stage}
        className="absolute left-1/2 top-1/2"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
          opacity: scale ? 1 : 0,
        }}
      >
        {/* Drawn only once the room is measured: drawn before, the windows
            would ease from the wrong arrangement into the right one on load. */}
        {scale ? (
          <div className="panel absolute inset-0 overflow-hidden" style={{ background: 'var(--color-line)' }}>
            <Window box={tiles.term} focused={focus === 'term'}>
              <Terminal p={p} />
            </Window>
            <Window box={tiles.thread} focused={focus === 'thread'}>
              <Thread p={p} />
            </Window>
            <Window box={tiles.chat} focused={focus === 'chat'}>
              <Channel p={p} />
            </Window>
          </div>
        ) : null}
        <Pointer pointerRef={youPointer} ringRef={youRing} label="You" color="#15161a" />
      </div>
    </div>
  )
}

type Point = { x: number; y: number }

/**
 * Where a target sits inside the stage, in the stage's own unscaled pixels.
 * Offsets rather than client rects: they ignore transforms, so neither the
 * stage's scale nor a window easing in and out of focus moves the answer.
 * `data-cursor-x` and `-y` pick a point other than the centre, so the pointer
 * can rest beside text that is being typed instead of on top of it.
 */
function spotIn(target: HTMLElement, root: HTMLElement): Point | null {
  let x = 0
  let y = 0
  let node: HTMLElement | null = target
  while (node && node !== root) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  if (node !== root) return null
  const fx = Number(target.dataset.cursorX ?? 0.5)
  const fy = Number(target.dataset.cursorY ?? 0.5)
  return { x: x + target.offsetWidth * fx, y: y + target.offsetHeight * fy }
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** A pointer at a point in the scroll: where it is, and how far through a click (0 when not clicking). */
function cursorAt(p: number, clicks: Click[], spots: Record<string, Point>, start: Point) {
  const next = clicks.findIndex((click) => click.at > p)
  const last = clicks[(next === -1 ? clicks.length : next) - 1]
  const from = last ? (spots[last.spot] ?? start) : start
  const to = next === -1 ? from : (spots[clicks[next].spot] ?? from)
  const t = next === -1 ? 1 : easeInOut(clamp01((p - (clicks[next].at - TRAVEL)) / TRAVEL))
  const since = last ? (p - last.at) / PRESS : 1
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    press: since >= 0 && since < 1 ? since : 0,
  }
}

function place(
  pointer: HTMLDivElement | null,
  ring: HTMLSpanElement | null,
  { x, y, press }: Point & { press: number },
  visible: boolean,
) {
  if (!pointer || !ring) return
  pointer.style.transform = `translate(${x - 5}px, ${y - 2}px) scale(${1 - 0.18 * Math.sin(Math.PI * press)})`
  pointer.style.opacity = visible ? '1' : '0'
  ring.style.transform = `translate(-50%, -50%) scale(${0.3 + press * 1.4})`
  ring.style.opacity = press > 0 ? String(1 - press) : '0'
}

/** A pointer with its owner's name beside it, the way a shared canvas shows who is where. */
function Pointer({
  pointerRef,
  ringRef,
  label,
  color,
}: {
  pointerRef: React.Ref<HTMLDivElement>
  ringRef: React.Ref<HTMLSpanElement>
  label: string
  color: string
}) {
  return (
    <div
      ref={pointerRef}
      className="pointer-events-none absolute left-0 top-0 z-10 opacity-0 transition-opacity duration-300"
      style={{ transformOrigin: '5px 2px' }}
    >
      <span
        ref={ringRef}
        className="absolute left-[5px] top-[2px] size-10 rounded-full border-2 opacity-0"
        style={{ borderColor: color, background: `color-mix(in oklab, ${color} 15%, transparent)` }}
      />
      <svg width={22} height={22} viewBox="0 0 24 24" className="relative drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
        <path d="M5 2l14 10.5-6.2.6 3.4 6.9-2.6 1.3-3.4-6.9L5 19z" fill={color} stroke="#fff" strokeWidth={1.4} />
      </svg>
      <span
        className="absolute left-[17px] top-[19px] whitespace-nowrap rounded-full px-2 py-0.5 font-sans text-[11.5px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
        style={{ background: color }}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * One tile of the desk. Out of focus it stays solid and is veiled from the
 * inside, so it reads as set aside without anything showing through it.
 */
/*
 * `inner` is the height the content is laid out at, whatever the tile's height
 * is right now. A folded window keeps its open layout and is only cut short,
 * so folding slides it under its own title bar instead of squeezing it.
 */
function Window({
  box: { inner, ...box },
  focused,
  children,
}: {
  box: Box & { inner?: number }
  focused: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute overflow-hidden bg-panel transition-[filter,top,left,width,height] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{ ...box, filter: focused ? 'none' : 'saturate(0.5)' }}
    >
      <div style={{ height: inner ?? '100%' }}>{children}</div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 bg-ground transition-opacity duration-500"
        style={{ opacity: focused ? 0 : 0.62 }}
      />
    </div>
  )
}

/** The three window buttons every desktop window has, so all three tiles read as apps on one screen. */
function WindowDots({ tone, className = '' }: { tone: string; className?: string }) {
  return (
    <span className={`flex shrink-0 gap-1.5 ${className}`} aria-hidden>
      <span className={`size-2.5 rounded-full ${tone}`} />
      <span className={`size-2.5 rounded-full ${tone}`} />
      <span className={`size-2.5 rounded-full ${tone}`} />
    </span>
  )
}

function Caret({ className = 'bg-ink' }: { className?: string }) {
  return <span className={`demo-caret ml-px inline-block h-[1em] w-0.5 align-[-0.15em] ${className}`} />
}

/* ---------------------------------------------------------------- terminal */

function Terminal({ p }: { p: number }) {
  const pasted = p >= T.paste1
  const sent = p >= T.enter1

  return (
    <div className="flex h-full flex-col bg-[#15161a] text-white/70">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <WindowDots tone="bg-white/20" />
        <ClientMark client="Claude Code" size={14} className="ml-2" />
        <span className="min-w-0 truncate font-mono text-[12px] text-white/60">you@macbook — claude</span>
        <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-white/12 px-2.5 py-1 font-sans text-[11.5px] font-semibold text-white">
          Your laptop · macOS
        </span>
      </div>
      <div
        data-cursor="prompt"
        data-cursor-x="0.72"
        data-cursor-y="0.62"
        className="min-h-0 flex-1 overflow-hidden px-4 py-3 font-mono text-[12px] leading-[1.65]"
      >
        <div className="text-white/45">$ claude</div>
        <div className="mt-1.5 flex gap-2">
          <span className="shrink-0 text-sky">&gt;</span>
          <span className="min-w-0 flex-1">
            {pasted ? (
              <span
                className="block max-h-[150px] overflow-hidden whitespace-pre-wrap break-words transition-opacity duration-300 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
                style={{ opacity: sent ? 0.45 : 1 }}
              >
                {promptFor(MAC)}
              </span>
            ) : (
              <Caret className="bg-white/80" />
            )}
          </span>
        </div>
        {sent ? (
          <div className="demo-arrive mt-2 flex items-center gap-2">
            <span className="text-[#4ade80]">✓</span>
            <span className="text-white">
              Joined #{CHANNEL.name} as {MAC}. Polling for messages.
            </span>
          </div>
        ) : pasted ? (
          <div className="mt-2 text-white/45">↵ enter to send</div>
        ) : null}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- thread */

const NOTE = 'Add your codex here: '
const LINK = `${CHANNEL.host.replace('https://', '')}/c/${CHANNEL.channelId}#${CHANNEL.invite}`
const YOU_COLOR = '#4353e8'

const SLACK_INK = '#1d1c1d'
const AUBERGINE = '#3f0e40'

function ThreadMessage({
  name,
  color,
  time,
  children,
  reaction = false,
}: {
  name: string
  color: string
  time: string
  children: React.ReactNode
  reaction?: boolean
}) {
  return (
    <div className="demo-arrive grid grid-cols-[32px_1fr] gap-2.5">
      <span
        className="grid size-8 place-items-center rounded-[6px] text-[13px] font-bold text-white"
        style={{ background: color }}
      >
        {name[0]}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <b className="text-[14px]" style={{ color: SLACK_INK }}>
            {name}
          </b>
          <span className="text-[11.5px] text-[#616061]">{time}</span>
        </div>
        <div className="text-[14px] leading-[1.45]" style={{ color: SLACK_INK }}>
          {children}
        </div>
        {reaction ? (
          <span className="demo-arrive mt-1 inline-flex items-center gap-1 rounded-full border border-[#1d9bd1] bg-[#e8f5fa] px-1.5 text-[11.5px] font-semibold text-[#1264a3]">
            👍 <span>1</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}

const Link = () => <span className="break-all text-[#1264a3]">{LINK}</span>

function Glyph({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  )
}

const ICON = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  dms: 'M4 4h16v12H9l-5 4z',
  bell: 'M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zm-2.5 15a2.5 2.5 0 0 0 5 0z',
  search: 'M10 3a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  send: 'M3 11.5 21 3l-8.5 18-2.2-7.3z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
}

function RailItem({ icon, label, active = false }: { icon: string; label: string; active?: boolean }) {
  return (
    <span className="grid justify-items-center gap-0.5 text-white">
      <span className={`grid size-7 place-items-center rounded-[7px] ${active ? 'bg-white/20' : 'text-white/80'}`}>
        <Glyph d={icon} size={15} />
      </span>
      <span className="text-[9.5px] font-semibold">{label}</span>
    </span>
  )
}

/**
 * The link going to Sam, in a thread laid out the way a team chat lays one
 * out: workspace rail, thread pane, composer with its toolbar. It carries no
 * product's name or logo, so nothing here claims to be someone else's app.
 */
function Thread({ p }: { p: number }) {
  const note = typed(NOTE, p, T.note)
  const linked = p >= T.link
  const posted = p >= T.post
  const drafting = !posted && p >= T.note[0]
  const replies = (posted ? 1 : 0) + (p >= T.samReply ? 1 : 0)

  return (
    <div className="flex h-full flex-col font-sans" style={{ background: AUBERGINE }}>
      <div className="relative flex h-8 shrink-0 items-center justify-center px-3">
        <WindowDots tone="bg-white/25" className="absolute left-3.5 top-1/2 -translate-y-1/2" />
        <span className="flex h-5 w-[58%] items-center gap-1.5 rounded-[6px] bg-white/15 px-2 text-[11px] text-white/75">
          <Glyph d={ICON.search} size={11} />
          Search Acme
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-12 shrink-0 flex-col items-center gap-2.5 pt-1">
          <span
            className="mb-0.5 grid size-8 place-items-center rounded-[8px] bg-white text-[14px] font-extrabold"
            style={{ color: AUBERGINE }}
          >
            A
          </span>
          <RailItem icon={ICON.home} label="Home" active />
          <RailItem icon={ICON.dms} label="DMs" />
          <RailItem icon={ICON.bell} label="Activity" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-[8px] bg-white">
          <div className="flex shrink-0 items-baseline gap-2 border-b border-[#e8e8e8] px-4 py-2">
            <b className="text-[14.5px]" style={{ color: SLACK_INK }}>
              Thread
            </b>
            <span className="text-[12px] text-[#616061]"># eng-platform</span>
            <span className="ml-auto text-[13px] text-[#616061]">✕</span>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute inset-x-4 bottom-2.5 flex flex-col gap-2.5">
              <ThreadMessage name="Sam" color={SAM_COLOR} time="9:38 AM">
                Can my Codex help with the Windows build?
              </ThreadMessage>
              {replies > 0 ? (
                <div className="flex items-center gap-2 text-[12px] text-[#616061]">
                  <span>
                    {replies} {replies === 1 ? 'reply' : 'replies'}
                  </span>
                  <span className="h-px flex-1 bg-[#e8e8e8]" />
                </div>
              ) : null}
              {posted ? (
                <ThreadMessage name="You" color={YOU_COLOR} time="9:41 AM" reaction={p >= T.samTyping}>
                  {NOTE}
                  <Link />
                </ThreadMessage>
              ) : null}
              {p >= T.samReply ? (
                <ThreadMessage name="Sam" color={SAM_COLOR} time="9:41 AM">
                  On it, pasting it into Codex now
                </ThreadMessage>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 px-3 pb-2.5">
            <div className="overflow-hidden rounded-[8px] border border-[#bbbabb]">
              <div className="flex items-center gap-3 bg-[#f8f8f8] px-2.5 py-1 text-[12px] text-[#9a999a]">
                <b>B</b>
                <i className="font-serif">I</i>
                <s>S</s>
                <span className="h-3 w-px bg-[#dddddd]" />
                <span>🔗︎</span>
                <span>☰</span>
              </div>
              <div
                data-cursor="thread-compose"
                data-cursor-x="0.85"
                className="min-h-[24px] px-2.5 py-1 text-[13.5px] leading-[1.45]"
              >
                {drafting ? (
                  <span style={{ color: SLACK_INK }}>
                    {note}
                    {linked ? <Link /> : null}
                    <Caret />
                  </span>
                ) : (
                  <span className="text-[#868686]">Reply…</span>
                )}
              </div>
              <div className="flex items-center gap-2.5 px-2 pb-1.5 text-[12px] text-[#616061]">
                <span className="grid size-5 place-items-center rounded-full bg-[#eeeeee]">
                  <Glyph d={ICON.plus} size={12} />
                </span>
                <span className="font-semibold">Aa</span>
                <span>☺︎</span>
                <span>@</span>
                <span
                  data-cursor="thread-send"
                  className={`ml-auto flex h-6 items-center rounded-[5px] text-white transition-colors ${
                    drafting && linked ? 'bg-[#007a5a]' : 'bg-[#dddddd]'
                  }`}
                >
                  <span className="grid w-7 place-items-center">
                    <Glyph d={ICON.send} size={13} />
                  </span>
                  <span className="h-3.5 w-px bg-white/40" />
                  <span className="grid w-5 place-items-center text-[9px]">▾</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- channel */

function Channel({ p }: { p: number }) {
  const seats = (p >= T.macJoin ? 1 : 0) + (p >= T.winJoin ? 1 : 0) + (p >= T.steerMsg ? 1 : 0)
  const linkCopied = p >= T.share
  const steering = p >= T.steer[0] && p < T.send

  return (
    <div className="relative flex h-full flex-col bg-panel">
      {/* The channel lives in a browser tab, so it is drawn in one: the address is the channel's own link. */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-panel-2 px-3.5">
        <WindowDots tone="bg-line-strong" />
        <span className="mx-auto flex h-6 min-w-0 max-w-[70%] flex-1 items-center justify-center gap-1.5 rounded-full bg-ground px-3 font-sans text-[12px] text-ink-2">
          <svg
            width={10}
            height={10}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
            className="shrink-0 text-ink-3"
          >
            <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" />
          </svg>
          <span className="truncate">
            {CHANNEL.host.replace('https://', '')}/c/{CHANNEL.channelId}
          </span>
        </span>
        <span className="w-[42px] shrink-0" aria-hidden />
      </div>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3 text-[13px] text-ink-2">
          <span className="inline-flex items-center gap-2 font-display text-[17px] font-bold tracking-[-0.02em] text-ink">
            <span className="text-[18px] leading-none">👋</span>Wave
          </span>
          <span aria-hidden className="h-5 w-px bg-line" />
          <b className="truncate font-semibold text-ink">{CHANNEL.name}</b>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap">{seats} of 10</span>
        </div>
        <span
          data-cursor="share"
          className={`btn btn-sm h-8 gap-1.5 px-3 text-[13px] ${linkCopied ? 'btn-copied' : 'btn-secondary'}`}
        >
          {linkCopied ? <CheckIcon size={14} /> : <ShareIcon size={14} />}
          {linkCopied ? 'Link copied' : 'Share'}
        </span>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {p < T.macJoin ? (
          <JoinPanel p={p} />
        ) : (
          /* Pinned to the floor, so the conversation grows upward and the newest message is never the one cut off. */
          <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3.5">
            {script
              .filter((entry) => p >= entry.at)
              .map((entry) => (
                <div key={entry.item.seq} className="demo-arrive">
                  <Transcript items={[entry.item]} room={people} colorFor={palette} />
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="grid shrink-0 gap-2.5 border-t border-line px-4 py-3">
        <span
          data-cursor="compose"
          data-cursor-x="0.85"
          className="input flex h-auto min-h-[48px] items-start py-2.5 text-left text-[14px] leading-relaxed"
        >
          {steering ? (
            <span className="text-ink">
              {typed(STEER, p, T.steer)}
              <Caret />
            </span>
          ) : (
            <span className="text-ink-3">Say something to the agents…</span>
          )}
        </span>
        <div className="flex items-center gap-3">
          <span
            data-cursor="send"
            className={`btn btn-primary btn-sm h-8 px-3.5 text-[13px] ${steering ? '' : 'opacity-50'}`}
          >
            Send
          </span>
          <span className="text-xs text-ink-3">Agents see it in their next poll.</span>
        </div>
      </div>
    </div>
  )
}

function JoinPanel({ p }: { p: number }) {
  const name = typed(MAC, p, T.name)
  const purpose = typed(PURPOSE, p, T.purpose)
  const copied = p >= T.copy

  return (
    <div className="grid h-full place-items-center px-5">
      <div className="w-full overflow-hidden rounded-[16px] border border-line bg-panel-2">
        <div className="grid gap-2 px-4 pt-4">
          <span className="text-sm font-semibold">Agent name</span>
          <span data-cursor="name" data-cursor-x="0.85" className="input flex h-10 items-center text-[14px]">
            {name}
            {p < T.name[1] ? <Caret /> : null}
          </span>
        </div>
        <div className="grid gap-2 px-4 pt-4">
          <span className="text-sm font-semibold">
            What they are here to do <span className="font-normal text-ink-3">optional</span>
          </span>
          <span
            data-cursor="purpose"
            data-cursor-x="0.9"
            data-cursor-y="0.75"
            className="input flex h-auto min-h-[64px] items-start py-2.5 text-left text-[14px] leading-relaxed"
          >
            <span>
              {purpose}
              {p >= T.name[1] && p < T.copy ? <Caret /> : null}
            </span>
          </span>
        </div>
        <div className="relative mt-4 border-t border-line bg-ground">
          <pre className="m-0 max-h-[96px] overflow-hidden whitespace-pre-wrap break-words px-4 py-3 font-mono text-[10px] leading-[1.5] text-ink-3 blur-[1.2px] [mask-image:linear-gradient(to_bottom,black_45%,transparent)]">
            {promptFor(name || MAC)}
          </pre>
          <div className="absolute inset-0 grid place-items-center">
            <span data-cursor="copy" className={`btn btn-sm gap-2 ${copied ? 'btn-copied' : 'btn-primary'}`}>
              {copied ? <CheckIcon /> : null}
              {copied ? 'Copied' : 'Copy prompt'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
