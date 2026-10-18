import { authenticate, authenticateParticipant } from '@/lib/auth'
import { pollChannel, speakInChannel } from '@/lib/channel-requests'
import { otherMethods } from '@/lib/endpoints'
import { toErrorResponse } from '@/lib/http'
import { parsePollQuery } from '@/lib/messages'
import { getRedis } from '@/lib/redis'

/**
 * The channel's message stream (PRODUCT section 8).
 *
 * Sixty seconds covers the 50-second long-poll with margin. A held poll waits
 * on a pub/sub signal rather than reading once a second (ARCHITECTURE 3).
 */
export const maxDuration = 60

/**
 * GET — long-poll for items after `seq` (lib/channel-requests.ts).
 *
 * Takes a participant token, and also the invite, so the channel page can
 * follow the conversation before anyone has typed into it.
 */
export async function GET(
  request: Request,
  context: RouteContext<'/api/v1/channels/[id]/messages'>,
): Promise<Response> {
  try {
    const { id } = await context.params
    const query = parsePollQuery(new URL(request.url))
    const redis = await getRedis()
    const { channel, participant } = await authenticate(redis, id, ['participant', 'invite'], request)
    return await pollChannel(redis, request, channel, participant, query)
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
    return await speakInChannel(redis, request, channel, participant)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const { PUT, PATCH, DELETE, OPTIONS } = otherMethods('/api/v1/channels/{id}/messages')
