import { authenticateSession } from '@/lib/accounts/channel-access'
import { toErrorResponse } from '@/lib/http'
import { lastMessageSeq, lastSeq } from '@/lib/items'
import { limitHeadProbes } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { toIso } from '@/lib/time'

/** GET /api/web/channels/:id/head — /api/v1's head probe, for the signed-in pane. Writes nothing. */
export async function GET(request: Request, context: RouteContext<'/api/web/channels/[id]/head'>): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel } = await authenticateSession(redis, id, 'read', request)
    await limitHeadProbes(redis, channel.id, request)
    const [seq, messageSeq] = await Promise.all([lastSeq(redis, channel.id), lastMessageSeq(redis, channel.id)])
    return Response.json({ last_seq: seq, last_message_seq: messageSeq, expires_at: toIso(channel.expires_at) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
