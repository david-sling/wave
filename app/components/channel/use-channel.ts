'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { closeMyChannel, importChannels, openHere, type OpenedHere } from '@/app/account-channels'
import { sessionAuth } from '@/lib/session-auth'
import { accountState } from '../account-link'
import { refreshAccountChannels } from './use-account-channels'
import { publishHead } from './use-unread'
import { dropAdminToken, readAdminToken as readStoredAdminToken } from '@/lib/admin-tokens'
import { forgetChannel, noteChannelMessage, rememberChannel } from './use-visited-channels'
import { readVisited } from '@/lib/visited-channels'

/**
 * The channel page's connection to its channel (ARCHITECTURE section 6).
 *
 * It polls the same long-poll endpoint the agents use. Signed out, the invite
 * comes from the URL fragment, so it never reaches the server in a page
 * request, and the admin token is read from this browser's storage and sent
 * only on close. Signed in, the page holds no key at all: every request goes
 * with the session (lib/accounts/channel-access.ts).
 */

export type Role = 'agent' | 'human'
export type Presence = 'active' | 'idle' | 'gone'

export type Item =
  | {
      seq: number
      ts: string
      type: 'message'
      from: { id: string; name: string; role: Role }
      text: string
      kind: 'message' | 'done'
      reply_to?: number
    }
  | {
      seq: number
      ts: string
      type: 'system'
      event: string
      /** The event as a sentence, written by the server (lib/events.ts). */
      text?: string
      subject?: { id: string; name: string; role: Role }
    }

export type RosterEntry = {
  id: string
  name: string
  role: Role
  presence: Presence
  client?: string
  /**
   * How far down the channel this participant's client has taken delivery.
   * Present only because this page asks for receipts; absent for anyone who
   * has not polled yet.
   */
  read_seq?: number
}

export type ChannelMeta = {
  id: string
  name: string
  mode: string
  created_at: string
  expires_at: string
  max_participants: number
}

export type ChannelStatus = 'loading' | 'ready' | 'gone' | 'no-invite' | 'error'

/** Who this page posts as. `token` is empty when signed in: the account holds the seat, not the page. */
export type Me = { id: string; token: string; name: string }

/**
 * Something you have said that the channel has not handed back yet.
 *
 * A message posts, then arrives on the next poll, and between the two there is
 * a round trip. Without this the text would vanish from the composer and
 * reappear in the transcript a moment later, which reads as a message that got
 * lost. So it is drawn straight away, dimmed, and the dimming lifts when the
 * real item arrives in its place.
 */
export type PendingMessage = {
  /** Local id, and the `client_id` the server dedupes retries on. */
  id: string
  text: string
  name: string
  ts: string
  /** The seq this answers, so a draft carries its quote rather than growing one on arrival. */
  replyTo?: number
  /** Set once the post is accepted. It is still pending until the poll delivers it. */
  seq?: number
}

/**
 * Long-poll seconds, the server's cap and the same hold the agents use. The
 * first read asks for none of them: history should not be waited for. Holding
 * one request costs almost nothing; starting a new one pays for the
 * authentication, the presence write and the roster read again.
 */
const POLL_WAIT = 50

/**
 * How often a hidden tab checks in. A participant silent for ten minutes is
 * announced as timed out, and someone whose tab is in the background has not
 * left, so this stays well inside that.
 */
const HIDDEN_HEARTBEAT_MS = 4 * 60_000

/** How a poll ended. Only a page that actually read the channel counts as having loaded it. */
type PollResult = 'ok' | 'retry' | 'gone'

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

/**
 * Drops the pending messages a poll has now delivered.
 *
 * By seq where the post came back in time to record one, and otherwise by
 * matching text from this participant — a poll already in flight can carry the
 * message back before its own POST has answered. Matches are consumed one for
 * one, so saying the same thing twice does not retire both copies at once.
 */
export function reconcile(
  queue: PendingMessage[],
  items: Item[],
  lastSeq: number,
  mine: string | undefined,
): PendingMessage[] {
  const arrived = new Map<string, number>()
  for (const item of items) {
    if (item.type === 'message' && item.from.id === mine) arrived.set(item.text, (arrived.get(item.text) ?? 0) + 1)
  }

  return queue.filter((entry) => {
    const waiting = arrived.get(entry.text) ?? 0
    const delivered = (entry.seq !== undefined && entry.seq <= lastSeq) || waiting > 0
    if (waiting > 0) arrived.set(entry.text, waiting - 1)
    return !delivered
  })
}

const participantKey = (channelId: string) => `wave.participant.${channelId}`

/** The seat token this browser kept for a channel before it moved to the profile, if any. */
export function keptSeatToken(channelId: string): string | undefined {
  try {
    const stored = window.localStorage.getItem(participantKey(channelId))
    return stored ? (JSON.parse(stored) as { token?: string }).token : undefined
  } catch {
    return undefined
  }
}

/** Lets go of the seat token, once the account holds the seat. */
export function dropKeptSeat(channelId: string): void {
  try {
    window.localStorage.removeItem(participantKey(channelId))
  } catch {
    // Storage off: there was nothing kept.
  }
}

/** The admin token this browser was handed for a channel it made on its own, if any. */
export function keptAdminToken(channelId: string): string | undefined {
  return readAdminToken(channelId) ?? undefined
}

/** Lets go of the admin token, once the account owns the channel. */
export function dropKeptAdmin(channelId: string): void {
  try {
    dropAdminToken(window.localStorage, channelId)
  } catch {
    // Storage off: there was nothing kept.
  }
}

// Next 16.3 can double the fragment (`#token#token`); tokens never contain `#`.
export function inviteFromHash(hash: string): string | null {
  return hash.split('#').pop() || null
}

export function readAdminToken(channelId: string): string | null {
  try {
    return readStoredAdminToken(window.localStorage, channelId)
  } catch {
    return null
  }
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private browsing. The channel still works for this tab.
  }
}

function dropStorage(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // As above.
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    return body?.error?.message ?? 'Something went wrong.'
  } catch {
    return 'Something went wrong.'
  }
}

export function useChannel(channelId: string) {
  const [status, setStatus] = useState<ChannelStatus>('loading')
  const [channel, setChannel] = useState<ChannelMeta | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [participants, setParticipants] = useState<RosterEntry[]>([])
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  /** Where the channel already was when this page opened: everything up to here is history. */
  const [historyUpTo, setHistoryUpTo] = useState<number | null>(null)
  /** The head of the channel, which is what a read receipt is measured against. */
  const [lastSeq, setLastSeq] = useState(0)

  const invite = useRef<string | null>(null)
  const cursor = useRef(0)
  /**
   * Seq of the latest message from anyone but you, published for the channels
   * pane in other tabs. Every tab in this browser is you, so your own message
   * is never news to them.
   */
  const lastMessage = useRef(0)
  const meRef = useRef<Me | null>(null)
  /** The join in flight, so two quick messages do not join this browser twice. */
  const joining = useRef<Promise<Me> | null>(null)
  /** The post in flight, so two quick messages keep the order they were typed in. */
  const posting = useRef<Promise<unknown>>(Promise.resolve())

  /**
   * Signed in, this page reads and posts with its session and is never handed
   * a key, so nothing is left in the browser when it signs out (AUTH.md 3.6).
   * The invite it is given is only for showing and sharing.
   */
  const viaAccount = useRef(false)

  /** Where requests go: the page API when signed in (session only), the agent API otherwise (tokens only). */
  const api = useCallback(
    (path = '') => `/api/${viaAccount.current ? 'web' : 'v1'}/channels/${channelId}${path}`,
    [channelId],
  )

  /** What a request carries: the session when signed in, otherwise the seat's token if `seat` and there is one, or the invite. */
  const credential = useCallback((seat: boolean): Record<string, string> => {
    if (viaAccount.current) return sessionAuth
    const token = (seat ? meRef.current?.token : undefined) ?? invite.current ?? ''
    return { authorization: `Bearer ${token}` }
  }, [])

  /** Joins as a human on first post, under the name they chose (PRODUCT 6.2). */
  const join = useCallback(
    async (name: string): Promise<Me> => {
      joining.current ??= (async () => {
        const response = await fetch(api('/join'), {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...credential(false) },
          body: JSON.stringify({ name, role: 'human', client: 'wave-web' }),
        })
        if (!response.ok) throw new Error(await readError(response))

        const joined = await response.json()
        // Signed in, the join answers without a token: the seat is the account's.
        const identity: Me = { id: joined.participant_id, token: joined.participant_token ?? '', name: joined.name }
        meRef.current = identity
        setMe(identity)
        if (!viaAccount.current) writeStorage(participantKey(channelId), JSON.stringify(identity))
        return identity
      })()

      try {
        return await joining.current
      } catch (failure) {
        // A failed join must not poison the next attempt.
        joining.current = null
        throw failure
      }
    },
    [api, channelId, credential],
  )

  /**
   * Says something, and shows it immediately.
   *
   * The draft goes into the transcript before the request leaves, and stays
   * there — dimmed — until the poll brings back the real item to replace it.
   * Nothing is removed on the way through, so the message never blinks out of
   * existence between being sent and arriving. A post that fails takes its
   * draft with it and throws, and the composer hands the text back.
   *
   * Posts queue behind one another. Nothing stops you typing the next message
   * while one is in flight, but two sent a moment apart must not race each
   * other into the transcript backwards. A failed post does not hold up the
   * one behind it.
   */
  const post = useCallback(
    async (text: string, name: string, replyTo?: number): Promise<void> => {
      const id = newId()
      setPending((queue) => [
        ...queue,
        {
          id,
          text,
          name: meRef.current?.name ?? name.trim(),
          ts: new Date().toISOString(),
          ...(replyTo === undefined ? {} : { replyTo }),
        },
      ])

      const ahead = posting.current
      const attempt = (async () => {
        await ahead.catch(() => {})
        const identity = meRef.current ?? (await join(name))
        const response = await fetch(api('/messages'), {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...credential(true) },
          body: JSON.stringify({ text, client_id: id, ...(replyTo === undefined ? {} : { reply_to: replyTo }) }),
        })
        if (!response.ok) throw new Error(await readError(response))

        const accepted = await response.json()
        setPending((queue) =>
          queue.map((entry) => (entry.id === id ? { ...entry, seq: accepted.seq, name: identity.name } : entry)),
        )
      })()
      posting.current = attempt

      try {
        await attempt
      } catch (failure) {
        setPending((queue) => queue.filter((entry) => entry.id !== id))
        throw failure
      }
    },
    [api, join, credential],
  )

  const closeChannel = useCallback(async (): Promise<void> => {
    if (viaAccount.current) {
      const closed = await closeMyChannel(channelId)
      if ('error' in closed) throw new Error(closed.error)
      setStatus('gone')
      void refreshAccountChannels()
      return
    }
    const admin = readAdminToken(channelId)
    if (!admin) throw new Error('The admin token for this channel is not in this browser.')

    const response = await fetch(`/api/v1/channels/${channelId}/close`, {
      method: 'POST',
      headers: { authorization: `Bearer ${admin}` },
    })
    if (!response.ok) throw new Error(await readError(response))
    forgetChannel(channelId)
    setStatus('gone')
  }, [channelId])

  useEffect(() => {
    const controller = new AbortController()
    let stopped = false

    /**
     * Finds the invite and, if there is one, this person's seat.
     *
     * Signed in, a channel on the account's profile opens through the account:
     * it answers with who the seat is and the invite to show, the invite leaves
     * the address bar, and every request goes with the session. A shared link
     * to a channel this browser does not hold yet is added to the profile
     * first. A channel this browser holds on its own stays on this device, with
     * its own keys, until it is moved to the profile from the pane.
     *
     * Signed out, or on this device only, it is as it always was: the invite
     * from the fragment, the identity from this browser's storage.
     */
    async function recall(): Promise<boolean> {
      const fromLink = inviteFromHash(window.location.hash)
      let opened: OpenedHere | null = null
      if ((await accountState()).who === 'in') {
        opened = await openHere(channelId).catch(() => null)
        const onThisDevice = readVisited().some((entry) => entry.id === channelId)
        if (!opened && fromLink && !onThisDevice) {
          const [added] = await importChannels([{ id: channelId, invite: fromLink }]).catch(() => [])
          if (added) {
            opened = await openHere(channelId).catch(() => null)
            void refreshAccountChannels()
          }
        }
      }
      if (controller.signal.aborted) return false
      viaAccount.current = opened !== null

      if (opened) {
        if (window.location.hash) {
          window.history.replaceState(window.history.state, '', window.location.pathname)
        }
        // Owned, the session closes it: a kept admin token is one key fewer to leave behind.
        if (opened.relation === 'owner') dropKeptAdmin(channelId)
        invite.current = opened.invite
        if (opened.participant) {
          const seat = { ...opened.participant, token: '' }
          meRef.current = seat
          setMe(seat)
        }
      } else {
        invite.current = fromLink
        if (invite.current && window.location.hash !== `#${invite.current}`) {
          window.history.replaceState(window.history.state, '', `${window.location.pathname}#${invite.current}`)
        }
        const identity = readIdentity()
        if (identity) {
          meRef.current = identity
          setMe(identity)
        }
      }

      if (!invite.current) {
        setStatus('no-invite')
        return false
      }
      setInviteToken(invite.current)
      return true
    }

    function readIdentity(): Me | null {
      const stored = readStorage(participantKey(channelId))
      if (!stored) return null
      try {
        return JSON.parse(stored) as Me
      } catch {
        // Unreadable. They will be asked for a name again on their first post.
        return null
      }
    }

    async function bootstrap(): Promise<boolean> {
      const response = await fetch(api(), {
        headers: credential(false),
        signal: controller.signal,
      })
      if (response.status === 410) {
        forgetChannel(channelId)
        setStatus('gone')
        return false
      }
      if (!response.ok) {
        setError(await readError(response))
        setStatus('error')
        return false
      }
      const view = await response.json()
      setChannel(view.channel)
      // Signed in, the account's list is the record; this browser keeps none.
      if (!viaAccount.current)
        rememberChannel({
          id: channelId,
          invite: invite.current ?? '',
          name: view.channel.name ?? '',
          expiresAt: Date.parse(view.channel.expires_at),
        })
      setParticipants(view.participants)
      setHistoryUpTo(view.last_seq)
      setLastSeq(view.last_seq)
      return true
    }

    /** One poll. `wait` of zero reads what is there and returns without holding. */
    async function pollOnce(wait: number): Promise<PollResult> {
      // receipts=1 is the page asking for everyone's cursor. The agents are not
      // given it unless they ask for it too, and are not told it exists: a
      // number saying a peer has not read something is a thing a person can
      // use and a thing an agent would act on (docs/IDEAS.md, read receipts).
      const response = await fetch(api(`/messages?after=${cursor.current}&wait=${wait}&receipts=1`), {
        headers: credential(true),
        signal: controller.signal,
      })
      if (response.status === 410) {
        forgetChannel(channelId)
        setStatus('gone')
        return 'gone'
      }
      if (response.status === 401 && viaAccount.current) {
        // The session ended, here or in another tab. The page held no key, so
        // there is nothing to fall back on: it stops until signed in again.
        setError('You signed out. Sign in again to keep reading this channel.')
        setStatus('error')
        return 'gone'
      }
      if (response.status === 401 && meRef.current) {
        // The seat's token stopped working: it left. Read with the invite again.
        meRef.current = null
        setMe(null)
        dropStorage(participantKey(channelId))
        return 'retry'
      }
      if (response.status === 429) {
        // Two polls already open, probably another tab. Back off and try again.
        await new Promise((resolve) => setTimeout(resolve, 3_000))
        return 'retry'
      }
      if (!response.ok) throw new Error(await readError(response))

      const page = await response.json()
      if (page.items.length > 0) {
        setItems((existing) => [...existing, ...page.items])
        cursor.current = page.last_seq
        const messages = (page.items as Item[]).filter((item) => item.type === 'message')
        const said = messages.at(-1)
        if (said) noteChannelMessage(channelId, Date.parse(said.ts))
        const heard = messages.findLast((item) => item.from.id !== meRef.current?.id)
        if (heard) lastMessage.current = heard.seq
      }
      publishHead(channelId, lastMessage.current)
      // In the same pass as the items above, so a message hands over to its own
      // draft within one render rather than flickering between the two.
      setPending((queue) => reconcile(queue, page.items, page.last_seq, meRef.current?.id))
      setParticipants(page.participants)
      setLastSeq(page.last_seq)
      setError(null)
      return 'ok'
    }

    /** Waits until the tab is shown again, or `ms` passes, or the page goes away. */
    function whileHidden(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer)
          document.removeEventListener('visibilitychange', onShown)
          controller.signal.removeEventListener('abort', finish)
          resolve()
        }
        const onShown = () => {
          if (document.visibilityState === 'visible') finish()
        }
        const timer = setTimeout(finish, ms)
        document.addEventListener('visibilitychange', onShown)
        controller.signal.addEventListener('abort', finish, { once: true })
      })
    }

    void (async () => {
      if (!(await recall())) return
      if (!(await bootstrap().catch(() => false))) return

      // The channel is not ready when its metadata lands, it is ready when its
      // transcript does. Opening on an empty room that fills in a moment later
      // reads as a channel that lost its history, so the first read is an
      // immediate one and the page waits for it.
      let loaded = false
      const loadedNow = () => {
        loaded = true
        // Never over the top of an ending: a closed channel stays closed.
        setStatus((current) => (current === 'loading' ? 'ready' : current))
      }

      while (!stopped) {
        try {
          // Between polls, never mid-poll: a tab hidden while one is in flight
          // lets it finish. The poll it starts on return is the catch-up read.
          if (loaded && document.visibilityState === 'hidden') {
            // Presence only, and only for someone who has spoken: a reader who
            // never posted is not in the roster and has nothing to keep alive.
            if (meRef.current) {
              const beat = await pollOnce(0).catch((): PollResult => 'retry')
              if (beat === 'gone') return
            }
            await whileHidden(HIDDEN_HEARTBEAT_MS)
            continue
          }

          const result = await pollOnce(loaded ? POLL_WAIT : 0)
          if (result === 'gone') return
          if (result === 'ok') loadedNow()
        } catch (failure) {
          if (controller.signal.aborted) return
          setError(failure instanceof Error ? failure.message : 'Lost the connection.')
          // Show the channel with its error rather than leaving it opening forever.
          loadedNow()
          // Wait before trying again, so a broken channel is not hammered.
          await new Promise((resolve) => setTimeout(resolve, 3_000))
        }
      }
    })()

    return () => {
      stopped = true
      controller.abort()
    }
  }, [channelId, api, credential])

  return {
    status,
    channel,
    items,
    pending,
    participants,
    me,
    error,
    invite: inviteToken,
    historyUpTo,
    lastSeq,
    post,
    closeChannel,
  }
}
