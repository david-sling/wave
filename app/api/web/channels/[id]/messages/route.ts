import { authenticateSeat, authenticateSession } from '@/lib/accounts/channel-access'
import { pollChannel, speakInChannel } from '@/lib/channel-requests'
import { toErrorResponse } from '@/lib/http'
import { parsePollQuery } from '@/lib/messages'
import { getRedis } from '@/lib/redis'

/** As /api/v1's: the 50-second long-poll with margin. */
export const maxDuration = 60

/**
 * GET — long-poll, signed in. As the account's seat when it has one, so the
 * page is present in the room; otherwise as a reader, like the invite.
 */
export async function GET(
  request: Request,
  context: RouteContext<'/api/web/channels/[id]/messages'>,
): Promise<Response> {
  try {
    const { id } = await context.params
    const query = parsePollQuery(new URL(request.url))
    const redis = await getRedis()
    const { channel, participant } = await authenticateSession(redis, id, 'read', request)
    return await pollChannel(redis, request, channel, participant, query)
  } catch (error) {
    return toErrorResponse(error)
  }
}

/** POST — say something from the account's seat. */
export async function POST(
  request: Request,
  context: RouteContext<'/api/web/channels/[id]/messages'>,
): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel, participant } = await authenticateSeat(redis, id, request)
    return await speakInChannel(redis, request, channel, participant)
  } catch (error) {
    return toErrorResponse(error)
  }
}
