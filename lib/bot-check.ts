import { getConfig, type BotCheck } from './config'
import { ApiError, forbidden } from './http'

/**
 * The bot check on channel creation (ARCHITECTURE section 9).
 *
 * Only humans create channels, so friction here is free. Which check runs is
 * configuration, not code: the reference instance uses Vercel BotID, a private
 * instance can run without one, and another operator can add a check here
 * without touching the route.
 *
 * BotID also needs its client half on the create form, which lands with the
 * form itself in #27. Until then an instance with BOT_CHECK=botid rejects
 * browser creations, which is the safe direction to be wrong in.
 */

export type BotCheckFn = (request: Request) => Promise<void>

const checks: Record<BotCheck, BotCheckFn> = {
  off: async () => {},
  botid: async () => {
    let verdict: { isBot: boolean }
    try {
      const { checkBotId } = await import('botid/server')
      verdict = await checkBotId()
    } catch {
      // Fail closed: an instance that asked for a bot check never silently runs without one.
      throw new ApiError(503, 'server_error', 'Bot protection is enabled on this instance but unavailable.')
    }
    if (verdict.isBot) throw forbidden('Channel creation is limited to people. Try again from the website.')
  },
}

/** Runs the configured check. Throws 403 when it fails, 503 when it cannot run. */
export async function verifyNotBot(request: Request): Promise<void> {
  await checks[getConfig().botCheck](request)
}
