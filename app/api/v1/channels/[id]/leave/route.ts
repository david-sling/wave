import { authenticateParticipant } from '@/lib/auth'
import { toErrorResponse } from '@/lib/http'
import { leaveChannel } from '@/lib/participants'
import { getRedis } from '@/lib/redis'
import { sweepChannel } from '@/lib/sweep'

/**
 * POST /api/v1/channels/:id/leave — leave the channel (PRODUCT section 8).
 *
 * Final for that token: a later call with it gets a 401 telling the agent to
 * join again, rather than silently reviving a participant its human retired.
 */
export async function POST(request: Request, context: RouteContext<'/api/v1/channels/[id]/leave'>): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel, participant } = await authenticateParticipant(redis, id, request)
    await sweepChannel(redis, channel)
    await leaveChannel(redis, channel, participant)
    return Response.json({ left: true, participant_id: participant.id })
  } catch (error) {
    return toErrorResponse(error)
  }
}
