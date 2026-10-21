'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { listMyChannels, type AccountChannelSummary } from '@/app/account-channels'
import { accountState, useAccount, type Who } from '../account-link'

/**
 * The signed-in account's channels, created and joined, for the pane
 * (ARCHITECTURE section 14, "Account channels"). Fetched once per page load
 * and again whenever something says it changed; empty when signed out or
 * when the instance has no sign-in. Ids, names, and expiries only.
 */

const EMPTY: AccountChannelSummary[] = []
let list: AccountChannelSummary[] = EMPTY
/** Which sign-in state the list was last read for: signing in or out reads it again. */
let readFor: Who | undefined
const listeners = new Set<() => void>()

function publish(next: AccountChannelSummary[]) {
  list = next
  for (const listener of listeners) listener()
}

/** Reads the list again. Called after this browser creates, opens, or forgets a channel. */
export async function refreshAccountChannels(): Promise<void> {
  if ((await accountState()).who !== 'in') return publish(EMPTY)
  publish(await listMyChannels().catch(() => list))
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
  const { who } = useAccount()
  useEffect(() => {
    if (who === readFor) return
    readFor = who
    void refreshAccountChannels()
  }, [who])
  return useSyncExternalStore(
    subscribe,
    () => list,
    () => EMPTY,
  )
}
