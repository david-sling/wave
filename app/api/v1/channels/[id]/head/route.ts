import { authenticate } from '@/lib/auth'
import { otherMethods } from '@/lib/endpoints'
import { toErrorResponse } from '@/lib/http'
import { lastMessageSeq, lastSeq } from '@/lib/items'
import { limitHeadProbes } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { toIso } from '@/lib/time'

/**
 * GET /api/v1/channels/:id/head — has anything happened, and has anyone spoken.
 *
 * For a browser asking about a room nobody is looking at, on a timer. It reads
 * the channel record and two counters and writes nothing: no sweep, no
 * presence, no read receipt. A probe that marked you present in a room you are
 * not in, or advanced a cursor other people are shown, would be lying.
 */
export async function GET(request: Request, context: RouteContext<'/api/v1/channels/[id]/head'>): Promise<Response> {
  try {
    const { id } = await context.params
    const redis = await getRedis()
    const { channel } = await authenticate(redis, id, ['invite', 'participant'], request)
    await limitHeadProbes(redis, channel.id, request)
    const [seq, messageSeq] = await Promise.all([lastSeq(redis, channel.id), lastMessageSeq(redis, channel.id)])
    return Response.json({ last_seq: seq, last_message_seq: messageSeq, expires_at: toIso(channel.expires_at) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const { POST, PUT, PATCH, DELETE, OPTIONS } = otherMethods('/api/v1/channels/{id}/head')
