'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { headKey, parseHead, PROBE, probeCandidates } from '@/lib/unread'
import { live, readVisited } from '@/lib/visited-channels'
import { publishHead } from './use-unread'
import { forgetChannel, noteChannelMessage } from './use-visited-channels'

function storedHead(id: string) {
  try {
    return parseHead(window.localStorage.getItem(headKey(id)))
  } catch {
    return null
  }
}

/** One round: asks about the rooms that need it and records what comes back. Returns how many requests it made. */
export async function probeRound(
  currentId: string | undefined,
  signal?: AbortSignal,
  now = Date.now(),
): Promise<number> {
  const rooms = live(readVisited(), now)
  const heads = new Map(rooms.map((room) => [room.id, storedHead(room.id)]))
  const ids = probeCandidates(
    rooms.map((room) => room.id),
    heads,
    currentId,
    now,
  )
  let made = 0

  for (const id of ids) {
    const room = rooms.find((candidate) => candidate.id === id)
    if (!room) continue
    made++
    let response: Response
    try {
      response = await fetch(`/api/v1/channels/${id}/head`, {
        headers: { authorization: `Bearer ${room.invite}` },
        signal,
      })
    } catch {
      return made
    }
    // Throttled: the dot goes stale rather than the page showing an error.
    if (response.status === 429) return made
    if (response.status === 410) {
      forgetChannel(id)
      continue
    }
    if (!response.ok) continue

    const body = (await response.json().catch(() => null)) as { last_message_seq?: unknown } | null
    const seq = typeof body?.last_message_seq === 'number' ? body.last_message_seq : null
    if (seq === null) continue
    const before = heads.get(id)
    publishHead(id, seq)
    // Only a head we had before can say this is new; a first probe just learns where the room is.
    if (before && seq > before.seq) noteChannelMessage(id, Date.now())
  }
  return made
}

/**
 * Asks about rooms no open tab is covering (#74), from a visible tab only. A
 * hidden tab skips its rounds rather than catching up on return, so switching
 * back to the tab never sets off a burst.
 */
export function startHeadProbe(currentId: () => string | undefined): () => void {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  const schedule = () => {
    timer = setTimeout(round, PROBE.intervalMs + (Math.random() * 2 - 1) * PROBE.jitterMs)
  }
  const round = async () => {
    if (document.visibilityState === 'visible') await probeRound(currentId(), controller.signal)
    if (!controller.signal.aborted) schedule()
  }
  schedule()
  return () => {
    controller.abort()
    clearTimeout(timer)
  }
}

export function useHeadProbe(): void {
  const { id } = useParams<{ id?: string }>()
  const current = useRef(id)

  useEffect(() => {
    current.current = id
  }, [id])

  useEffect(() => startHeadProbe(() => current.current), [])
}
