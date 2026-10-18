'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { dropHead, dropHeadsExcept } from './use-unread'
import {
  VISITED_KEY,
  forget,
  live,
  noteMessage,
  parse,
  readVisited,
  record,
  writeVisited,
  type VisitedChannel,
} from '@/lib/visited-channels'
import { dropAdminToken, pruneAdminTokens } from '@/lib/admin-tokens'

/** `storage` only reaches other tabs, so a write announces itself to its own. */
const CHANGED = 'wave:channels-changed'
const EMPTY: VisitedChannel[] = []

let lastRaw: string | null = null
let lastList: VisitedChannel[] = EMPTY

export function snapshot(): VisitedChannel[] {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(VISITED_KEY)
  } catch {
    return EMPTY
  }
  if (raw !== lastRaw) {
    lastRaw = raw
    lastList = parse(raw)
  }
  return lastList
}

const serverSnapshot = () => EMPTY

export function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === VISITED_KEY || event.key === null) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGED, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGED, onChange)
  }
}

function update(change: (list: VisitedChannel[]) => VisitedChannel[]): void {
  writeVisited(change(readVisited()))
  window.dispatchEvent(new Event(CHANGED))
}

export function rememberChannel(entry: Parameters<typeof record>[1], now = Date.now()): void {
  if (!entry.invite || !Number.isFinite(entry.expiresAt)) return
  update((list) => record(list, entry, now))
  dropHeadsExcept(new Set(readVisited().map((kept) => kept.id)))
  pruneAdmin(now)
}

/** Drops the admin tokens of channels that have expired. */
export function pruneAdmin(now = Date.now()): void {
  try {
    pruneAdminTokens(window.localStorage, now, new Set(live(readVisited(), now).map((entry) => entry.id)))
  } catch {
    // Storage switched off: there is nothing stored to prune.
  }
}

export function noteChannelMessage(id: string, at: number): void {
  if (!Number.isFinite(at)) return
  const list = readVisited()
  const next = noteMessage(list, id, at)
  if (next === list) return
  writeVisited(next)
  window.dispatchEvent(new Event(CHANGED))
}

export function forgetChannel(id: string): void {
  update((list) => forget(list, id))
  dropHead(id)
  try {
    dropAdminToken(window.localStorage, id)
  } catch {
    // Storage switched off: there is nothing stored to drop.
  }
}

/** Unfiltered by expiry: the reader applies `live()` against its own clock. */
export function useVisitedChannels(): VisitedChannel[] {
  useEffect(() => pruneAdmin(), [])
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
