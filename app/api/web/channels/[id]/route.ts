import { authenticateSession } from '@/lib/accounts/channel-access'
import { channelView } from '@/lib/channels'
import { toErrorResponse } from '@/lib/http'
import { getRedis } from '@/lib/redis'
import { sweepChannel } from '@/lib/sweep'

/**
 * GET /api/web/channels/:id — the channel page's read, signed in.
 *
 * The page API: the same answers as /api/v1, for a signed-in page that holds
 * no key, authenticated by its session alone (lib/accounts/channel-access.ts).
 * Agents never use it, and it reads no token.
 */
export async function GET(request: Request, context: RouteContext<'/api/web/channels/[id]'>): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel } = await authenticateSession(redis, id, 'read', request)
    await sweepChannel(redis, channel)
    return Response.json(await channelView(redis, channel))
  } catch (error) {
    return toErrorResponse(error)
  }
}
