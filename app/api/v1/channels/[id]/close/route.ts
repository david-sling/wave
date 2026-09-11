import { authenticate } from '@/lib/auth'
import { closeChannel } from '@/lib/channels'
import { toErrorResponse } from '@/lib/http'
import { getRedis } from '@/lib/redis'

/**
 * POST /api/v1/channels/:id/close — close and purge (PRODUCT section 6.6).
 *
 * Admin only, and irreversible: every key the channel owns is deleted before
 * the response returns, so a later call to any endpoint gets a 410.
 */
export async function POST(request: Request, context: RouteContext<'/api/v1/channels/[id]/close'>): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel } = await authenticate(redis, id, 'admin', request)
    await closeChannel(redis, channel)
    return Response.json({ closed: true, channel_id: channel.id })
  } catch (error) {
    return toErrorResponse(error)
  }
}
