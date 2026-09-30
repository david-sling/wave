'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import { rotateAdminToken } from './actions'
import { adminTokenKey } from '@/app/components/create-channel'
import { snapshot, subscribe } from '@/app/components/channel/use-visited-channels'

type Props = { id: string; name: string; expiresAt: string; createdAt: string }

const hasAdminToken = (id: string) => {
  try {
    return window.localStorage.getItem(adminTokenKey(id)) !== null
  } catch {
    return false
  }
}

/**
 * One channel this account owns. The invite lives only in browsers that
 * opened the room, so the link is drawn from this browser's visited list
 * when it has one. The button is AUTH.md 3.6: a new admin token, kept where
 * the create dialog keeps it, so this device can close the channel.
 */
export function OwnedChannel({ id, name, expiresAt, createdAt }: Props) {
  const visited = useSyncExternalStore(subscribe, snapshot, () => [])
  const invite = visited.find((entry) => entry.id === id)?.invite
  const [held, setHeld] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controlled = held ?? (typeof window !== 'undefined' && hasAdminToken(id))

  const recover = async () => {
    setBusy(true)
    setError(null)
    const result = await rotateAdminToken(id)
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    try {
      window.localStorage.setItem(adminTokenKey(id), result.adminToken)
      setHeld(true)
    } catch {
      setError('This browser cannot keep the token. Private browsing, or storage is off.')
    }
  }

  return (
    <li className="grid gap-2 rounded-[12px] border border-line-2 bg-panel-2 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 text-[14px]">
          <div className="truncate font-medium">
            {invite ? (
              <Link href={`/c/${id}#${invite}`} className="link no-underline hover:underline" prefetch={false}>
                #{name || 'unnamed-channel'}
              </Link>
            ) : (
              <span>#{name || 'unnamed-channel'}</span>
            )}
          </div>
          <div className="text-[13px] text-ink-3">
            Created {createdAt} · expires {expiresAt}
            {invite ? '' : ' · not opened in this browser'}
          </div>
        </div>
        <button type="button" onClick={recover} disabled={busy} className="btn btn-secondary btn-sm shrink-0">
          {busy ? 'Rotating…' : controlled ? 'Rotate admin token' : 'Take control here'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="error-note m-0 text-sm">
          {error}
        </p>
      ) : null}
    </li>
  )
}
