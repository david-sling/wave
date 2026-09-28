'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { byActivity, live, type VisitedChannel } from '@/lib/visited-channels'
import { CloseIcon } from '../icons'
import { Logo } from '../logo'
import { forgetChannel, rememberChannel, useVisitedChannels } from './use-visited-channels'

const UNDO_MS = 5_000

function RowName({ name, className }: { name: string; className: string }) {
  return (
    <span className={`block truncate text-[13.5px] leading-snug ${className}`}>
      <b aria-hidden className="mr-1 font-bold text-ink-3">
        #
      </b>
      {name || 'unnamed-channel'}
    </span>
  )
}

export function ChannelList() {
  const { id: currentId } = useParams<{ id: string }>()
  const stored = useVisitedChannels()
  const [now, setNow] = useState(() => Date.now())
  const [forgotten, setForgotten] = useState<VisitedChannel | null>(null)
  const undo = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!forgotten) return
    undo.current?.focus()
    const timer = setTimeout(() => {
      if (document.activeElement === undo.current) list.current?.focus()
      setForgotten(null)
    }, UNDO_MS)
    return () => clearTimeout(timer)
  }, [forgotten])

  const known = byActivity(live(stored, now))
  const forget = (entry: VisitedChannel) => {
    forgetChannel(entry.id)
    setForgotten(entry)
  }

  return (
    <div className="grid gap-3">
      <ul ref={list} tabIndex={-1} className="m-0 grid list-none gap-px p-0 outline-none">
        {known.map((entry) =>
          entry.id === currentId ? (
            <li key={entry.id}>
              {/* A link rather than a label, so it is in the tab order and announced as where you are. */}
              <Link
                href={`/c/${entry.id}`}
                aria-current="page"
                onClick={(event) => event.preventDefault()}
                className="block cursor-default rounded-[8px] border border-line bg-panel px-2 py-1"
              >
                <RowName name={entry.name} className="font-semibold text-ink" />
              </Link>
            </li>
          ) : (
            <li key={entry.id} className="group relative">
              {/* Link, not <a>: a soft navigation commits the fragment before the
                  next page reads its invite (#69). No prefetch, since each visible
                  row would otherwise be a request to the server. */}
              <Link
                href={`/c/${entry.id}#${entry.invite}`}
                prefetch={false}
                className="block rounded-[8px] border border-transparent px-2 py-1 pr-8 transition-colors hover:bg-panel"
              >
                <RowName name={entry.name} className="font-medium text-ink-2 group-hover:text-ink" />
              </Link>
              <button
                type="button"
                onClick={() => forget(entry)}
                aria-label={`Forget #${entry.name || 'unnamed-channel'}`}
                title="Forget this channel in this browser"
                className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[6px] text-ink-3 transition-[opacity,color,background-color] hover:bg-line-2 hover:text-ink pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
              >
                <CloseIcon size={13} />
              </button>
            </li>
          ),
        )}

        {forgotten ? (
          <li role="status" className="flex items-center justify-between gap-2 px-2 py-1 text-[12.5px] text-ink-3">
            <span className="min-w-0 truncate">Forgot #{forgotten.name || 'unnamed-channel'}</span>
            <button
              ref={undo}
              type="button"
              className="shrink-0 font-semibold text-ink-2 underline underline-offset-2 hover:text-ink"
              onClick={() => {
                rememberChannel(forgotten, forgotten.lastSeenAt)
                setForgotten(null)
              }}
            >
              Undo
            </button>
          </li>
        ) : null}
      </ul>

      {known.every((entry) => entry.id === currentId) && !forgotten ? (
        <p className="m-0 px-2 text-[12.5px] leading-relaxed text-ink-3">
          Other channels you open in this browser will be listed here.
        </p>
      ) : null}
    </div>
  )
}

export const channelListNote = 'Kept in this browser only, and gone when each room expires.'

/**
 * Lives in the /c layout, not the page, so it stays put while the channel
 * beside it is swapped.
 */
export function ChannelsPane() {
  return (
    <nav className="hidden w-[240px] shrink-0 flex-col border-r border-line bg-panel-2 lg:flex" aria-label="Channels">
      <div className="flex h-10 shrink-0 box-content items-center border-b border-line px-4 py-2.5">
        <Logo size={24} />
      </div>
      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto px-2 py-4">
        <h2 className="m-0 mb-2 px-2 font-sans text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">
          Channels
        </h2>
        <ChannelList />
      </div>
      <p className="m-0 shrink-0 border-t border-line px-4 py-3 text-[12px] leading-relaxed text-ink-3">
        {channelListNote}
      </p>
    </nav>
  )
}
