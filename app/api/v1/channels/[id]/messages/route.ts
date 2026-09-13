import { authenticate, authenticateParticipant } from '@/lib/auth'
import { listParticipants, roster } from '@/lib/channels'
import { readJson, toErrorResponse } from '@/lib/http'
import { lastSeq } from '@/lib/items'
import { LIMITS } from '@/lib/limits'
import { itemsAfter, parsePollQuery, postMessage, postMessageRequestSchema } from '@/lib/messages'
import { touchParticipant } from '@/lib/participants'
import { callerAddress, limitImmediatePolling, limitPosting, withConcurrencyLimit } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { sweepChannel } from '@/lib/sweep'
import { openWake } from '@/lib/wake'

/**
 * The channel's message stream (PRODUCT section 8).
 *
 * Sixty seconds covers the 50-second long-poll with margin. A held poll waits
 * on a pub/sub signal from whoever writes next and reads the sequence number
 * only to confirm it (ARCHITECTURE section 3), so an idle agent costs a
 * handful of Redis commands a minute rather than one a second.
 */
export const maxDuration = 60

/** How often a held poll looks anyway. Short, because nothing else will tell it. */
const POLL_INTERVAL_MS = 1_000

/**
 * How often a subscribed poll looks anyway.
 *
 * Signals arrive in milliseconds, so this is only the floor under a signal
 * that never came. The two ways that happens are covered elsewhere: a
 * subscriber that reconnects tells every poll to look again the moment it is
 * back, and one that has quietly died is turned into a reconnect by the ping
 * it fails (lib/wake.ts). What is left is a publish that never went out at
 * all, which is rare enough to be worth one read in the middle of a hold
 * rather than five.
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
 * GET — long-poll for items after `seq`.
 *
 * Takes a participant token, and also the invite, so the channel page can
 * follow the conversation before anyone has typed into it. Only a participant
 * is marked alive by polling; a reader watching over the invite is not in the
 * roster and has no presence to update.
 */
export async function GET(
  request: Request,
  context: RouteContext<'/api/v1/channels/[id]/messages'>,
): Promise<Response> {
  try {
    const { id } = await context.params
    const { after, wait } = parsePollQuery(new URL(request.url))
    const redis = await getRedis()
    const { channel, participant } = await authenticate(redis, id, ['participant', 'invite'], request)

    // Before anything that writes: a poll that does not wait is the one an
    // agent can issue in a tight loop, and refusing it should be cheap.
    if (wait === 0) {
      await limitImmediatePolling(redis, participant?.id ?? callerAddress(request))
    }

    // Once per request, at the start, as ARCHITECTURE section 3 specifies.
    if (participant) await touchParticipant(redis, channel, participant)
    await sweepChannel(redis, channel)

    const poll = async (): Promise<Response> => {
      const deadline = Date.now() + wait * 1_000
      // Before the first read, never after: a message that lands in between
      // would signal an empty room and this poll would hold to its deadline
      // with the answer already in Redis.
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
              participants: roster(await listParticipants(redis, channel.id)),
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
    return participant && wait > 0
      ? await withConcurrencyLimit(redis, participant.id, LIMITS.maxConcurrentPolls, poll)
      : await poll()
  } catch (error) {
    return toErrorResponse(error)
  }
}

/** POST — say something. Participants only: reading a channel does not make you part of it. */
export async function POST(
  request: Request,
  context: RouteContext<'/api/v1/channels/[id]/messages'>,
): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel, participant } = await authenticateParticipant(redis, id, request)
    const body = await readJson(request, postMessageRequestSchema)

    await limitPosting(redis, participant.id)
    const alive = await touchParticipant(redis, channel, participant)
    await sweepChannel(redis, channel)
    return Response.json(await postMessage(redis, channel, alive, body), { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
