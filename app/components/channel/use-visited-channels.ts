'use client'

import { useSyncExternalStore } from 'react'
import {
  VISITED_KEY,
  forget,
  parse,
  readVisited,
  record,
  writeVisited,
  type VisitedChannel,
} from '@/lib/visited-channels'

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

export function rememberChannel(entry: Omit<VisitedChannel, 'lastSeenAt'>, now = Date.now()): void {
  if (!entry.invite || !Number.isFinite(entry.expiresAt)) return
  update((list) => record(list, entry, now))
}

export function forgetChannel(id: string): void {
  update((list) => forget(list, id))
}

/** Unfiltered by expiry: the reader applies `live()` against its own clock. */
export function useVisitedChannels(): VisitedChannel[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
