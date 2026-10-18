'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { byActivity, live, type VisitedChannel } from '@/lib/visited-channels'
import { forgetEverywhere, importChannels } from '@/app/account-channels'
import { SignOutForm, useAccount } from '../account-link'
import { CreateChannelButton } from '../create-channel'
import { CloseIcon, PersonIcon, PlusIcon, SignOutIcon } from '../icons'
import { Logo } from '../logo'
import { hideAccountChannel, refreshAccountChannels, useAccountChannels } from './use-account-channels'
import { useHeadProbe } from './use-head-probe'
import { dropKeptAdmin, dropKeptSeat, keptAdminToken, keptSeatToken } from './use-channel'
import { unreadOf, useUnreadVersion } from './use-unread'
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

function OtherRow({
  entry,
  unread,
  everywhere,
  onForget,
}: {
  entry: VisitedChannel
  unread: boolean
  /** The channel is the account's, so forgetting it here forgets it on every device. */
  everywhere: boolean
  onForget: (entry: VisitedChannel) => void
}) {
  return (
    <li className="group relative">
      {/* Link, not <a>: a soft navigation commits the fragment before the
          next page reads its invite (#69). No prefetch, since each visible
          row would otherwise be a request to the server. */}
      <Link
        // An account's channel this browser has not opened has no invite yet; the page asks the account for it.
        href={entry.invite ? `/c/${entry.id}#${entry.invite}` : `/c/${entry.id}`}
        prefetch={false}
        className="block rounded-[8px] border border-transparent px-2 py-1 pr-14 transition-colors hover:bg-panel pointer-fine:pr-8"
      >
        <RowName
          name={entry.name}
          className={unread ? 'font-semibold text-ink' : 'font-medium text-ink-2 group-hover:text-ink'}
        />
        {unread ? <span className="sr-only">, unread</span> : null}
      </Link>
      {unread ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-9 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-ink transition-opacity pointer-fine:right-3 pointer-fine:group-focus-within:opacity-0 pointer-fine:group-hover:opacity-0"
        />
      ) : null}
      <button
        type="button"
        onClick={() => onForget(entry)}
        aria-label={`Forget #${entry.name || 'unnamed-channel'}`}
        title={everywhere ? 'Forget this channel on every device' : 'Forget this channel in this browser'}
        className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[6px] text-ink-3 transition-[opacity,color,background-color] hover:bg-line-2 hover:text-ink pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
      >
        <CloseIcon size={13} />
      </button>
    </li>
  )
}

/**
 * On signing in, this browser's own channels join the account, and the
 * browser lets go of their invites and seat keys: from then on the account
 * hands them over each time a channel opens (AUTH.md 3.6). Admin tokens stay,
 * since a channel made without an account never gains an owner and its token
 * is the only way to close it.
 */
function useImportOnSignIn(who: string, stored: VisitedChannel[]) {
  const importing = useRef(false)
  useEffect(() => {
    if (who !== 'in' || stored.length === 0 || importing.current) return
    importing.current = true
    const local = stored.map((entry) => ({
      id: entry.id,
      invite: entry.invite,
      participantToken: keptSeatToken(entry.id),
      adminToken: keptAdminToken(entry.id),
    }))
    void importChannels(local)
      .then((imported) => {
        for (const { id, owner } of imported) {
          forgetChannel(id)
          dropKeptSeat(id)
          if (owner) dropKeptAdmin(id)
        }
        return refreshAccountChannels()
      })
      .catch(() => {})
      .finally(() => {
        importing.current = false
      })
  }, [who, stored])
}

export function ChannelList() {
  const { id: currentId } = useParams<{ id?: string }>()
  const stored = useVisitedChannels()
  const account = useAccountChannels()
  const { who } = useAccount()
  useImportOnSignIn(who, stored)
  useUnreadVersion()
  const [now, setNow] = useState(() => Date.now())
  const [forgotten, setForgotten] = useState<{ entry: VisitedChannel; local: boolean; everywhere: boolean } | null>(
    null,
  )
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
      // Only once the chance to undo has passed does the account forget it.
      if (forgotten.everywhere) void forgetEverywhere(forgotten.entry.id).then(refreshAccountChannels)
      setForgotten(null)
    }, UNDO_MS)
    return () => clearTimeout(timer)
  }, [forgotten])

  // Signed in, the account's channels are the list and this browser keeps none;
  // signed out, it is this browser's own, by activity.
  const signedIn = who === 'in'
  const accountIds = new Set(account.map((entry) => entry.id))
  const local = signedIn ? [] : byActivity(live(stored, now))
  const localIds = new Set(local.map((entry) => entry.id))
  const elsewhere: VisitedChannel[] = account
    .filter((entry) => !localIds.has(entry.id) && entry.expiresAt > now)
    .map((entry) => ({
      id: entry.id,
      invite: '',
      name: entry.name,
      expiresAt: entry.expiresAt,
      lastSeenAt: 0,
      addedAt: 0,
      lastMessageAt: 0,
    }))
  const known = [...local, ...elsewhere]
  const forget = (entry: VisitedChannel) => {
    const wasLocal = localIds.has(entry.id)
    if (wasLocal) forgetChannel(entry.id)
    if (accountIds.has(entry.id)) hideAccountChannel(entry.id)
    setForgotten({ entry, local: wasLocal, everywhere: accountIds.has(entry.id) })
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
            <OtherRow
              key={entry.id}
              entry={entry}
              unread={unreadOf(entry.id, now) === 'unread'}
              everywhere={accountIds.has(entry.id)}
              onForget={forget}
            />
          ),
        )}

        {forgotten ? (
          <li role="status" className="flex items-center justify-between gap-2 px-2 py-1 text-[12.5px] text-ink-3">
            <span className="min-w-0 truncate">
              Forgot #{forgotten.entry.name || 'unnamed-channel'}
              {forgotten.everywhere ? ' everywhere' : ''}
            </span>
            <button
              ref={undo}
              type="button"
              className="shrink-0 font-semibold text-ink-2 underline underline-offset-2 hover:text-ink"
              onClick={() => {
                if (forgotten.local) rememberChannel(forgotten.entry, forgotten.entry.lastSeenAt)
                // The account has not been told yet, so reading it again brings the row back.
                if (forgotten.everywhere) void refreshAccountChannels()
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
          {known.length === 0
            ? 'Channels you open will be listed here.'
            : 'Other channels you open will be listed here.'}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The way to the account, at the foot of the pane: Account when signed in,
 * Sign in when not, and nothing on an instance without sign-in.
 */
function AccountRow() {
  const { who, email, name } = useAccount()
  const here = usePathname() === '/account'
  if (who === 'off') return null
  const signedIn = who === 'in'
  // The whole strip below the rule is the link, so there is nothing to aim at;
  // sign out sits at its end as a sibling, since a button cannot live in a link.
  return (
    <div
      className={`relative flex shrink-0 items-stretch border-t border-line transition-colors ${
        here ? 'bg-panel' : 'hover:bg-panel'
      }`}
    >
      <Link
        href={signedIn ? '/account' : '/signin'}
        aria-current={here ? 'page' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3 no-underline ${signedIn ? 'pr-12' : ''} ${
          here ? 'text-ink' : 'text-ink-2 hover:text-ink'
        }`}
      >
        <PersonIcon size={16} className="shrink-0 text-ink-3" />
        <span className="grid min-w-0">
          <span className={`truncate text-[13.5px] leading-snug ${here ? 'font-semibold' : 'font-medium'}`}>
            {signedIn ? name || 'Account' : 'Sign in'}
          </span>
          {signedIn && email ? (
            <span className="truncate text-[12px] leading-snug text-ink-3" title={email}>
              {email}
            </span>
          ) : null}
        </span>
      </Link>
      {signedIn ? (
        <SignOutForm className="absolute right-2 top-1/2 -translate-y-1/2">
          <span className="relative">
            <button
              type="submit"
              aria-label="Sign out"
              className="tip-trigger grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-line-2 hover:text-ink"
            >
              <SignOutIcon size={16} />
            </button>
            <span className="choice-tip" aria-hidden>
              Sign out
            </span>
          </span>
        </SignOutForm>
      ) : null}
    </div>
  )
}

/**
 * Lives in the layouts of /c and /account, not their pages, so it stays put
 * while the page beside it is swapped.
 */
export function ChannelsPane() {
  useHeadProbe()
  // At /c the list is the page, so on a phone it takes the whole width; beside
  // a channel or the account it is a desktop column, and a phone reaches it
  // through the back link at /c.
  const index = usePathname() === '/c'
  return (
    <nav
      className={`${index ? 'flex w-full lg:w-[240px]' : 'hidden w-[240px] lg:flex'} shrink-0 flex-col border-line bg-panel-2 lg:border-r`}
      aria-label="Channels"
    >
      <div className="box-content flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <Logo size={24} />
      </div>
      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto px-2 py-4">
        <div className="mb-1 flex items-center justify-between gap-2 pl-2">
          <h2 className="m-0 font-sans text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">Channels</h2>
          <span className="relative">
            <CreateChannelButton className="tip-trigger grid size-7 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-line-2 hover:text-ink pointer-coarse:size-9">
              <PlusIcon size={16} />
              <span className="sr-only">New channel</span>
            </CreateChannelButton>
            <span className="choice-tip choice-tip-below" aria-hidden>
              New channel
            </span>
          </span>
        </div>
        <ChannelList />
      </div>
      <AccountRow />
    </nav>
  )
}
