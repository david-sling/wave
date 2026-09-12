import { authenticate, authenticateParticipant } from '@/lib/auth'
import { listParticipants, roster } from '@/lib/channels'
import { readJson, toErrorResponse } from '@/lib/http'
import { lastSeq } from '@/lib/items'
import { itemsAfter, parsePollQuery, postMessage, postMessageRequestSchema } from '@/lib/messages'
import { touchParticipant } from '@/lib/participants'
import { getRedis } from '@/lib/redis'
import { sweepChannel } from '@/lib/sweep'

/**
 * The channel's message stream (PRODUCT section 8).
 *
 * Sixty seconds covers the 50-second long-poll with margin. The handler is a
 * loop over Redis reads rather than a subscription: one read a second while
 * idle, which is cheap enough for v1 and keeps the whole channel in one store
 * (ARCHITECTURE section 3).
 */
export const maxDuration = 60

const POLL_INTERVAL_MS = 1_000

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

    // Once per request, at the start, as ARCHITECTURE section 3 specifies.
    if (participant) await touchParticipant(redis, channel, participant)
    await sweepChannel(redis, channel)

    const deadline = Date.now() + wait * 1_000
    for (;;) {
      const seq = await lastSeq(redis, channel.id)
      const ready = seq > after || Date.now() >= deadline || request.signal.aborted
      if (ready) {
        return Response.json({
          items: seq > after ? await itemsAfter(redis, channel.id, after) : [],
          last_seq: seq,
          participants: roster(await listParticipants(redis, channel.id)),
        })
      }
      await sleep(POLL_INTERVAL_MS, request.signal)
    }
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

    const alive = await touchParticipant(redis, channel, participant)
    await sweepChannel(redis, channel)
    return Response.json(await postMessage(redis, channel, alive, body), { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
