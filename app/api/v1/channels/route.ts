import { createChannel, createChannelRequestSchema } from '@/lib/channels'
import { readJson, toErrorResponse } from '@/lib/http'
import { getRedis } from '@/lib/redis'

/**
 * POST /api/v1/channels — create a channel (PRODUCT sections 6.1 and 8).
 *
 * The only endpoint that takes no token: a channel has no credentials until it
 * exists. Wave is built for automated clients, so the door is not guarded by a
 * bot check; abuse control is the per-IP creation limit in #22. The response
 * carries the invite and admin tokens once; storage keeps only their hashes.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request, createChannelRequestSchema)
    const created = await createChannel(await getRedis(), body)
    return Response.json(created, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
