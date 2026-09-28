'use client'

import { useSyncExternalStore } from 'react'
import { HEAD_PREFIX, headKey, parseHead, readKey, unreadState, type UnreadState } from '@/lib/unread'

const CHANGED = 'wave:heads-changed'
let version = 0

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function publishHead(channelId: string, seq: number, now = Date.now()): void {
  try {
    window.localStorage.setItem(headKey(channelId), JSON.stringify({ seq, at: now }))
  } catch {
    return
  }
  window.dispatchEvent(new Event(CHANGED))
}

export function dropHead(channelId: string): void {
  try {
    window.localStorage.removeItem(headKey(channelId))
  } catch {
    // Nothing stored, then.
  }
}

/** Heads for rooms the list no longer holds, so none outlives its entry. */
export function dropHeadsExcept(ids: ReadonlySet<string>): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(HEAD_PREFIX) && !ids.has(key.slice(HEAD_PREFIX.length))) stale.push(key)
    }
    for (const key of stale) window.localStorage.removeItem(key)
  } catch {
    // Private browsing: there is nothing to prune.
  }
}

export function unreadOf(channelId: string, now: number): UnreadState {
  return unreadState(parseHead(read(headKey(channelId))), Number(read(readKey(channelId)) ?? 0) || 0, now)
}

function subscribe(onChange: () => void): () => void {
  const bump = () => {
    version++
    onChange()
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(HEAD_PREFIX) || event.key.startsWith('wave.read.')) bump()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGED, bump)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGED, bump)
  }
}

/** Changes whenever a head or a read mark does; the reader calls unreadOf in render. */
export function useUnreadVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
}
