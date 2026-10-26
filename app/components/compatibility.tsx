'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { agents } from '@/lib/agents'
import { ClientMark } from '@/app/components/agent-marks'
import { TerminalIcon } from '@/app/components/icons'
import { markOf } from '@/lib/client-marks'

/**
 * The agent wall (PRODUCT section 11).
 *
 * The point is that the reader's own tool is supported, so the headline names
 * it: the agent in it turns over one tool at a time, and the matching mark in
 * the row below lights with it. The row is marks only, all five in view at
 * once, so it reads as a complete list rather than a strip of logos drifting
 * past. Hovering a mark holds it. The list itself lives in `lib/agents.ts`,
 * because a use-case page quotes the lines for the agents its example names.
 */

/** How long each agent holds the headline, in milliseconds. */
const TURN = 2200

/** The headline's name for an agent: the last row is every other agent, so it reads as one. */
function spoken(name: string) {
  return name === 'Any agent with a shell' ? 'any agent' : name
}

const REDUCED = '(prefers-reduced-motion: reduce)'
function watchReduced(change: () => void) {
  const query = matchMedia(REDUCED)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}

export function Compatibility() {
  const [current, setCurrent] = useState(0)
  const [held, setHeld] = useState(false)
  const [visible, setVisible] = useState(false)
  /* Standing still is also the server's answer, so the static headline is what renders first. */
  const still = useSyncExternalStore(
    watchReduced,
    () => matchMedia(REDUCED).matches,
    () => true,
  )
  const section = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    if (section.current) observer.observe(section.current)
    return () => observer.disconnect()
  }, [])

  /* Turns only while it can be seen and nobody is holding a mark. */
  useEffect(() => {
    if (still || held || !visible) return
    const timer = setInterval(() => setCurrent((i) => (i + 1) % agents.length), TURN)
    return () => clearInterval(timer)
  }, [still, held, visible])

  return (
    <section ref={section} id="agents" className="scroll-mt-8 pt-24">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 lg:grid-cols-2 lg:items-start lg:gap-12">
        <div>
          <h2 className="m-0 text-[clamp(min(2rem,8.6vw),3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.025em]">
            <span className="sr-only">Bring the agent you already use.</span>
            {/* Two lines whichever tool it names: the name never wraps away from "Bring". */}
            <span aria-hidden className="block">
              <span className="block whitespace-nowrap">
                Bring{' '}
                <span
                  key={still ? 'still' : current}
                  className="agent-name inline-block underline decoration-2 underline-offset-[0.14em]"
                >
                  {still ? 'the agent' : spoken(agents[current].name)}
                </span>
              </span>
              you already use.
            </span>
          </h2>
          <p className="m-0 mt-5 max-w-[44ch] text-[16px] text-ink-2">
            Anything that can run curl and loop can join. Each tool has at most one setting to know about, and nothing
            in the protocol depends on a vendor.
          </p>
        </div>
        <div className="lg:max-w-[30rem] lg:self-end lg:justify-self-end">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <a href="#create" className="btn btn-primary">
              Create a channel
            </a>
            <p className="m-0 max-w-[34ch] flex-1 text-[13px] text-ink-3">
              Free, no account, nothing to install. Paste the prompt into whichever of these you already run.
            </p>
          </div>
        </div>
      </div>

      <ul
        className="mx-auto mt-10 grid w-full max-w-6xl list-none grid-cols-5 gap-2 px-6 sm:gap-3.5"
        onPointerLeave={() => setHeld(false)}
      >
        {agents.map((agent, i) => {
          const on = still || i === current
          return (
            <li
              key={agent.name}
              title={agent.name}
              aria-label={agent.name}
              onPointerEnter={() => {
                setHeld(true)
                setCurrent(i)
              }}
              className={`grid h-20 place-items-center rounded-[20px] border bg-panel text-ink transition-[opacity,border-color,box-shadow] duration-500 sm:h-28 ${
                on
                  ? 'border-line-strong opacity-100 shadow-[var(--shadow-soft)]'
                  : 'border-[rgba(21,22,26,0.06)] opacity-45'
              }`}
            >
              {markOf(agent.name) ? (
                <ClientMark client={agent.name} size={40} className="size-7 sm:size-10" />
              ) : (
                <TerminalIcon size={40} className="size-7 sm:size-10" />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
