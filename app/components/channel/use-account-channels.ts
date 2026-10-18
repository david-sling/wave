'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { listMyChannels, type AccountChannelSummary } from '@/app/account-channels'
import { accountState } from '../account-link'

/**
 * The signed-in account's channels, created and joined, for the pane
 * (ARCHITECTURE section 14, "Account channels"). Fetched once per page load
 * and again whenever something says it changed; empty when signed out or
 * when the instance has no sign-in. Ids, names, and expiries only.
 */

const EMPTY: AccountChannelSummary[] = []
let list: AccountChannelSummary[] = EMPTY
let loading: Promise<void> | undefined
const listeners = new Set<() => void>()

function publish(next: AccountChannelSummary[]) {
  list = next
  for (const listener of listeners) listener()
}

/** Reads the list again. Called after this browser creates, opens, or forgets a channel. */
export function refreshAccountChannels(): Promise<void> {
  loading = (async () => {
    if ((await accountState()).who !== 'in') return publish(EMPTY)
    publish(await listMyChannels().catch(() => list))
  })()
  return loading
}

/** Drops one entry at once, ahead of the server, so a forgotten row does not linger. */
export function hideAccountChannel(id: string) {
  publish(list.filter((entry) => entry.id !== id))
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function useAccountChannels(): AccountChannelSummary[] {
  useEffect(() => {
    loading ??= refreshAccountChannels()
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => list,
    () => EMPTY,
  )
}
