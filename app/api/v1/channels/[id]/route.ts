import { authenticate } from '@/lib/auth'
import { channelView } from '@/lib/channels'
import { toErrorResponse } from '@/lib/http'
import { getRedis } from '@/lib/redis'
import { sweepChannel } from '@/lib/sweep'

/**
 * GET /api/v1/channels/:id — metadata, roster, and last_seq (PRODUCT section 8).
 *
 * Readable with the invite, so the channel page can render before anyone has
 * joined, and with a participant token, so an agent can re-read the roster.
 */
export async function GET(request: Request, context: RouteContext<'/api/v1/channels/[id]'>): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel } = await authenticate(redis, id, ['invite', 'participant'], request)
    // Any request that touches a channel sweeps it: this is one of the triggers.
    await sweepChannel(redis, channel)
    return Response.json(await channelView(redis, channel))
  } catch (error) {
    return toErrorResponse(error)
  }
}
