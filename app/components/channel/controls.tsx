'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { CheckIcon, DownloadIcon, LinkIcon, TrashIcon } from '../icons'
import { copyText } from './copy-text'
import { downloadTranscript } from './export-transcript'
import type { ChannelMeta, Item, RosterEntry } from './use-channel'

/** Counts down to expiry, in the coarsest unit that is still honest. */
function remaining(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
  if (seconds === 0) return 'expired'
  if (seconds < 60) return `${seconds}s left`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m left`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m left`
  return `${Math.floor(hours / 24)}d left`
}

export function ExpiryCountdown({ expiresAt, className = 'text-[13px]' }: { expiresAt: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span className={`whitespace-nowrap text-ink-3 ${className}`} title={new Date(expiresAt).toLocaleString()}>
      {remaining(expiresAt, now)}
    </span>
  )
}

type Tone = 'panel' | 'panel-2'

/**
 * One action in the channel's tray: an icon, what it does, and underneath in
 * a smaller line what doing it means. The second line replaces the paragraph
 * each action used to carry, so the list stays scannable and the warning is
 * still read at the moment of choosing.
 */
function ActionRow({
  icon,
  label,
  detail,
  onClick,
  disabled = false,
  danger = false,
  tone,
}: {
  icon: ReactNode
  label: ReactNode
  detail: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  tone: Tone
}) {
  const hover = danger ? 'hover:bg-peach-soft' : tone === 'panel' ? 'hover:bg-panel-2' : 'hover:bg-panel'
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`grid w-full grid-cols-[20px_1fr] items-start gap-x-3 rounded-[10px] px-2.5 py-2 text-left transition-colors disabled:cursor-default disabled:hover:bg-transparent ${hover}`}
      >
        <span
          className={`grid h-5 place-items-center ${danger ? 'text-peach-ink' : disabled ? 'text-ink-3' : 'text-ink-2'}`}
        >
          {icon}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span
            className={`text-[14px] font-medium leading-5 ${danger ? 'text-peach-ink' : disabled ? 'text-ink-3' : 'text-ink'}`}
          >
            {label}
          </span>
          <span className="text-[12.5px] leading-snug text-ink-3">{detail}</span>
        </span>
      </button>
    </li>
  )
}

/**
 * What can be done to the channel itself, as one list: copy its link, take the
 * conversation away, close it. The side pane and the phone's sheet draw the
 * same list, the sheet with the link in it because a phone's bar has only an
 * icon for it.
 */
export function ChannelActions({
  shareUrl,
  canClose,
  onClose,
  transcript,
  tone = 'panel',
}: {
  /** Offered as a row when given. The desktop bar carries it instead. */
  shareUrl?: string
  canClose: boolean
  onClose: () => Promise<void>
  /** Everything the export needs. Passed down rather than re-read: the page already has it. */
  transcript: { channel: ChannelMeta; items: Item[]; participants: RosterEntry[] }
  tone?: Tone
}) {
  const [confirming, setConfirming] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null)
  const empty = transcript.items.length === 0

  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => setCopied(null), 2_000)
    return () => clearTimeout(timer)
  }, [copied])

  const exportDetail = empty
    ? 'Nothing has been said yet.'
    : 'Saved to this device. The channel is deleted when it expires.'

  return (
    <div className="grid gap-2">
      <ul className="-mx-2.5 m-0 grid list-none gap-px p-0" aria-label="Channel actions">
        {shareUrl ? (
          <ActionRow
            tone={tone}
            icon={copied === 'copied' ? <CheckIcon size={17} className="check-pop text-ok" /> : <LinkIcon size={17} />}
            label={
              copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Could not copy the link' : 'Copy channel link'
            }
            detail="Anyone with it can join and read the channel. Treat it like a key."
            onClick={async () => setCopied((await copyText(shareUrl)) ? 'copied' : 'failed')}
          />
        ) : null}
        <ActionRow
          tone={tone}
          icon={<DownloadIcon size={17} />}
          label="Export as Markdown"
          detail={exportDetail}
          disabled={empty}
          onClick={() => downloadTranscript(transcript, 'md')}
        />
        <ActionRow
          tone={tone}
          icon={<DownloadIcon size={17} />}
          label="Export as JSON"
          detail={empty ? exportDetail : 'Every item and participant, for a script to read.'}
          disabled={empty}
          onClick={() => downloadTranscript(transcript, 'json')}
        />
        {canClose && !confirming ? (
          <ActionRow
            tone={tone}
            danger
            icon={<TrashIcon size={17} />}
            label="Close channel"
            detail="Deletes everything immediately, for everyone."
            onClick={() => setConfirming(true)}
          />
        ) : null}
      </ul>

      {confirming ? (
        <div className="grid gap-2 rounded-[12px] border border-peach bg-peach-soft/40 p-3">
          <p className="m-0 text-[13px] text-ink-2">
            This deletes every message and key in the channel now, for everyone. It cannot be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-danger-filled"
              onClick={async () => {
                try {
                  await onClose()
                } catch (error) {
                  setFailure(error instanceof Error ? error.message : 'The channel did not close.')
                }
              }}
            >
              Close and delete
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      {failure ? (
        <p role="status" className="error-note m-0 text-sm">
          {failure}
        </p>
      ) : null}
    </div>
  )
}
