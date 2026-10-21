import { listParticipants, roster } from './channels'
import { readJson } from './http'
import { lastSeq } from './items'
import { LIMITS } from './limits'
import { itemsAfter, postMessage, postMessageRequestSchema, type parsePollQuery } from './messages'
import { touchParticipant } from './participants'
import { callerAddress, limitImmediatePolling, limitPosting, withConcurrencyLimit } from './rate-limit'
import type { WaveRedis } from './redis'
import { sweepChannel } from './sweep'
import type { ChannelRecord, ParticipantRecord } from './types'
import { openWake } from './wake'

/**
 * What reading and speaking in a channel do once the caller is known, shared
 * by the agent API (/api/v1, bearer tokens) and the page API (/api/web, the
 * session). Each route authenticates in its own way and hands over here; nothing
 * in this module reads a credential.
 */

/**
 * How often an unsubscribed poll looks, since nothing will tell it.
 */
const POLL_INTERVAL_MS = 1_000

/**
 * How often a subscribed poll looks anyway: the floor under a signal that
 * never came. Reconnects announce themselves (lib/wake.ts), so this only has
 * to catch a publish that never went out.
 */
const WAKE_TICK_MS = 25_000

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
    function finish() {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
  })
}

/**
 * Long-poll for items after `after`.
 *
 * Only a participant is marked alive by polling; a reader watching over the
 * invite is not in the roster, has no presence to update, and leaves no read
 * receipt behind.
 */
export async function pollChannel(
  redis: WaveRedis,
  request: Request,
  channel: ChannelRecord,
  participant: ParticipantRecord | undefined,
  { after, wait, receipts }: ReturnType<typeof parsePollQuery>,
): Promise<Response> {
  // Before anything that writes, so refusing is cheap.
  if (wait === 0) {
    await limitImmediatePolling(redis, participant?.id ?? callerAddress(request))
  }

  // Once per request, at the start, as ARCHITECTURE section 3 specifies. The
  // cursor rides along with it: taking delivery is a fact about this request,
  // not about how long the poll that made it ends up holding.
  if (participant) await touchParticipant(redis, channel, participant, after)
  await sweepChannel(redis, channel)

  const poll = async (): Promise<Response> => {
    const deadline = Date.now() + wait * 1_000
    // Before the first read, never after: a message landing in between would
    // signal an empty room and this poll would hold with the answer in Redis.
    const wake = wait > 0 ? await openWake(redis, channel.id) : undefined
    const tick = wake ? WAKE_TICK_MS : POLL_INTERVAL_MS
    try {
      for (;;) {
        const seq = await lastSeq(redis, channel.id)
        const remaining = deadline - Date.now()
        if (seq > after || remaining <= 0 || request.signal.aborted) {
          return Response.json({
            items: seq > after ? await itemsAfter(redis, channel.id, after) : [],
            last_seq: seq,
            // Receipts are as fresh as this read and no fresher. Nothing
            // publishes when a cursor moves, so a held poll is not woken by
            // one — it carries whatever the roster says at the moment it
            // returns for a reason of its own.
            participants: roster(await listParticipants(redis, channel.id), {
              ...(receipts ? { receiptsUpTo: seq } : {}),
            }),
          })
        }
        // Never past the deadline: the caller asked for at most `wait`
        // seconds, and the function has only ten more than that before it is cut off.
        const nap = Math.min(tick, remaining)
        await (wake ? wake.wait(nap, request.signal) : sleep(nap, request.signal))
      }
    } finally {
      await wake?.close()
    }
  }

  // Only a held request needs a slot: an immediate read costs nothing to allow.
  // A reader without a seat is counted by channel and address (#94).
  if (wait === 0) return await poll()
  const holder = participant?.id ?? `invite:${channel.id}:${callerAddress(request)}`
  return await withConcurrencyLimit(redis, holder, LIMITS.maxConcurrentPolls, poll)
}

/** Says something. Participants only: reading a channel does not make you part of it. */
export async function speakInChannel(
  redis: WaveRedis,
  request: Request,
  channel: ChannelRecord,
  participant: ParticipantRecord,
): Promise<Response> {
  const body = await readJson(request, postMessageRequestSchema)
  await limitPosting(redis, participant.id)
  const alive = await touchParticipant(redis, channel, participant)
  await sweepChannel(redis, channel)
  return Response.json(await postMessage(redis, channel, alive, body), { status: 201 })
}
