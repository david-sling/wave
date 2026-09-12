import { getConfig } from '@/lib/config'
import { toErrorResponse, unauthorized } from '@/lib/http'
import { getRedis } from '@/lib/redis'
import { sweepAllChannels } from '@/lib/sweep'
import { hashToken, tokenMatches } from '@/lib/tokens'

/**
 * The sweep's backstop run (ARCHITECTURE section 5).
 *
 * Deliberately outside `/api/v1`: the public API is the seven documented
 * endpoints, and this is operations. Vercel Cron calls it with GET and the
 * CRON_SECRET as a bearer token; POST is here so any other scheduler can drive
 * it the same way. Everything it does also happens on the request paths, so
 * missing a run costs nothing but a delayed event in an empty channel.
 */
async function sweep(request: Request): Promise<Response> {
  try {
    const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!tokenMatches(presented, hashToken(getConfig().cronSecret))) {
      throw unauthorized('This route requires the instance CRON_SECRET as a bearer token.')
    }
    return Response.json(await sweepAllChannels(await getRedis()))
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const GET = sweep
export const POST = sweep
