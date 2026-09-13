import { createHash } from 'node:crypto'
import { getConfig } from './config'
import { ApiError } from './http'
import { keys } from './keys'
import { LIMITS } from './limits'
import type { WaveRedis } from './redis'

/**
 * Per-token and per-IP limits (PRODUCT section 8, ARCHITECTURE section 7).
 *
 * Counters only, never identities: the subject of a limit is stored as a
 * salted hash with a short TTL, so the abuse record of an IP address is not a
 * record of the IP address. The salt is derived from the instance's own
 * secret, so the hashes cannot be replayed against another instance.
 */

export type Limit = {
  /** Counter namespace, e.g. `create` or `post`. */
  scope: string
  /** Who is being limited: an IP address, a participant ID, a channel ID. */
  subject: string
  max: number
  windowSeconds: number
}

function fingerprint(subject: string): string {
  return createHash('sha256').update(`${getConfig().cronSecret}:${subject}`).digest('hex').slice(0, 32)
}

/**
 * Counts one request against a limit. Throws 429 with Retry-After once the
 * window is used up, and the counter keeps climbing, so a caller that ignores
 * the answer does not reset its own window by retrying.
 */
export async function enforceLimit(redis: WaveRedis, limit: Limit): Promise<void> {
  const key = keys.rateLimit(limit.scope, fingerprint(limit.subject))
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, limit.windowSeconds)
  if (count <= limit.max) return

  const ttl = await redis.ttl(key)
  const retryAfter = ttl > 0 ? ttl : limit.windowSeconds
  throw new ApiError(429, 'rate_limited', `Too many requests. Try again in ${retryAfter} seconds.`, {
    headers: { 'Retry-After': String(retryAfter) },
  })
}

/**
 * Holds a slot while `work` runs, so a participant cannot park more than two
 * long-polls at once. The slot carries a TTL as well as being released in a
 * finally, because a function killed mid-request never reaches the finally.
 */
export async function withConcurrencyLimit<T>(
  redis: WaveRedis,
  subject: string,
  max: number,
  work: () => Promise<T>,
): Promise<T> {
  const key = keys.rateLimit('concurrent', fingerprint(subject))
  const held = await redis.incr(key)
  // Two minutes is longer than any request this app allows, so a leaked slot heals.
  await redis.expire(key, 120)

  if (held > max) {
    await redis.decr(key)
    throw new ApiError(429, 'rate_limited', `At most ${max} requests of this kind can be open at once.`, {
      headers: { 'Retry-After': '1' },
      hint: 'Wait for the poll you already have open to return before starting another.',
    })
  }

  try {
    return await work()
  } finally {
    await redis.decr(key)
  }
}

/**
 * The address a request came from, as the platform reported it.
 *
 * This is only as trustworthy as the proxy in front of the app: on Vercel the
 * header is set by the platform and cannot be forged by the caller, but a
 * self-hosted instance behind a proxy that passes a client-supplied
 * X-Forwarded-For would be trusting the caller. The per-IP limit is a
 * courtesy check either way; the per-token limits are the real ones.
 */
export function callerAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

/** Channel creation, per IP. */
export async function limitChannelCreation(redis: WaveRedis, request: Request): Promise<void> {
  await enforceLimit(redis, {
    scope: 'create',
    subject: callerAddress(request),
    max: LIMITS.createsPerHourPerIp,
    windowSeconds: 3_600,
  })
}

/**
 * Polls that do not wait, per caller. Held polls are bounded by the slot above,
 * so counting them too would put a write on the path every waiting agent sits on.
 */
export async function limitImmediatePolling(redis: WaveRedis, subject: string): Promise<void> {
  await enforceLimit(redis, {
    scope: 'poll',
    subject,
    max: LIMITS.immediatePollsPerMinute,
    windowSeconds: 60,
  })
}

/** Messages, per participant. */
export async function limitPosting(redis: WaveRedis, participantId: string): Promise<void> {
  await enforceLimit(redis, {
    scope: 'post',
    subject: participantId,
    max: LIMITS.messagesPerMinute,
    windowSeconds: 60,
  })
}
