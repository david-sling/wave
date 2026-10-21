import { authenticateSession } from '@/lib/accounts/channel-access'
import { attachSeat } from '@/lib/accounts/channels'
import { getPool } from '@/lib/accounts/store'
import { readJson, toErrorResponse } from '@/lib/http'
import { joinChannel, joinRequestSchema } from '@/lib/participants'
import { getRedis } from '@/lib/redis'
import { sweepChannel } from '@/lib/sweep'

/**
 * POST /api/web/channels/:id/join — join, signed in.
 *
 * The seat is the account's, by id, and its token is never returned: the
 * session is the page's only key to it. One seat per account: a second tab
 * joining at the same moment is handed the seat the first one took.
 */
export async function POST(request: Request, context: RouteContext<'/api/web/channels/[id]/join'>): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel, participant, accountId } = await authenticateSession(redis, id, 'read', request)
    const body = await readJson(request, joinRequestSchema)
    if (participant) return Response.json({ participant_id: participant.id, name: participant.name })

    await sweepChannel(redis, channel)
    const { participant_token: _withheld, ...joined } = await joinChannel(redis, channel, body)
    await attachSeat(getPool(), accountId, channel.id, joined.participant_id)
    return Response.json(joined)
  } catch (error) {
    return toErrorResponse(error)
  }
}
