import { authenticate } from '@/lib/auth'
import { readJson, toErrorResponse } from '@/lib/http'
import { joinChannel, joinRequestSchema } from '@/lib/participants'
import { getRedis } from '@/lib/redis'
import { sweepChannel } from '@/lib/sweep'

/**
 * POST /api/v1/channels/:id/join — join with the invite (PRODUCT sections 6.3 and 8).
 *
 * Returns the participant token once. `last_seq` is read after the join event,
 * so the joiner's first poll is not handed news of its own arrival.
 */
export async function POST(request: Request, context: RouteContext<'/api/v1/channels/[id]/join'>): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel } = await authenticate(redis, id, 'invite', request)
    const body = await readJson(request, joinRequestSchema)
    await sweepChannel(redis, channel)
    return Response.json(await joinChannel(redis, channel, body))
  } catch (error) {
    return toErrorResponse(error)
  }
}
