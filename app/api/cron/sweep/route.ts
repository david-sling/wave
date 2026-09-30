import { getAccountsConfig } from '@/lib/accounts/config'
import { pruneOwnedChannels } from '@/lib/accounts/owned'
import { getPool } from '@/lib/accounts/store'
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
    const swept = await sweepAllChannels(await getRedis())
    // With sign-in on, the owned-channel index sheds rows whose channel expired on its own.
    if (!getAccountsConfig().enabled) return Response.json(swept)
    return Response.json({ ...swept, owned_pruned: await pruneOwnedChannels(getPool()) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const GET = sweep
export const POST = sweep
