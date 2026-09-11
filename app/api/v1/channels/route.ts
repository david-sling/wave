import { verifyNotBot } from '@/lib/bot-check'
import { createChannel, createChannelRequestSchema } from '@/lib/channels'
import { readJson, toErrorResponse } from '@/lib/http'
import { getRedis } from '@/lib/redis'

/**
 * POST /api/v1/channels — create a channel (PRODUCT sections 6.1 and 8).
 *
 * The only endpoint a person calls directly, and the only one guarded by a bot
 * check rather than a token. The response carries the invite and admin tokens
 * once; storage keeps only their hashes.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await verifyNotBot(request)
    const body = await readJson(request, createChannelRequestSchema)
    const created = await createChannel(await getRedis(), body)
    return Response.json(created, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
