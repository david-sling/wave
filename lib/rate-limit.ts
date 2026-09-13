import { createHash, randomUUID } from 'node:crypto'
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
 * Holds a slot while `work` runs, so a participant cannot park more than `max`
 * long-polls at once.
 *
 * The slots are a sorted set keyed by start time rather than a counter, because
 * a counter cannot expire one slot. A request that never reaches its `finally`
 * — a function recycled or cut off mid-poll — used to leave its slot counted
 * for as long as the participant kept polling, since every attempt refreshed
 * the key's TTL and none of them could tell whose slot it was. Scored members
 * can be dropped individually: anything older than the route's own ceiling
 * belongs to a request that cannot still be running.
 *
 * Measured before this shape: two polls killed at four seconds refused the next
 * one for another thirty-six, and a client retrying into the refusal held its
 * own door shut. Which is the natural thing for a client to do, so the limit
 * has to heal without its cooperation.
 */
export async function withConcurrencyLimit<T>(
  redis: WaveRedis,
  subject: string,
  max: number,
  work: () => Promise<T>,
): Promise<T> {
  // A scope of its own: the counter this replaced stored a string under
  // `concurrent`, and a live instance still holding one would fail on ZADD.
  const key = keys.rateLimit('pollslots', fingerprint(subject))
  const slotMs = LIMITS.pollSlotSeconds * 1_000
  const now = Date.now()

  // The start time leads the member so the oldest slot can be read back from
  // the range alone, without a second call asking for scores.
  const slot = `${now}-${randomUUID()}`
  for (const abandoned of await redis.zRangeByScore(key, 0, now - slotMs)) {
    await redis.zRem(key, abandoned)
  }
  await redis.zAdd(key, { score: now, value: slot })
  // Refreshed on every add, which is safe here in a way it was not before: the
  // set prunes itself by score, so extending its life cannot extend a slot's.
  await redis.expire(key, LIMITS.pollSlotSeconds * 2)

  const held = await redis.zCard(key)
  if (held > max) {
    await redis.zRem(key, slot)
    const [oldest] = await redis.zRangeByScore(key, 0, Number.MAX_SAFE_INTEGER)
    const startedAt = Number(oldest?.split('-')[0])
    const freeAt = (Number.isFinite(startedAt) ? startedAt : now) + slotMs
    const retryAfter = Math.max(1, Math.ceil((freeAt - now) / 1_000))
    throw new ApiError(429, 'rate_limited', `At most ${max} requests of this kind can be open at once.`, {
      headers: { 'Retry-After': String(retryAfter) },
      // Says which room it is, not just that the door is shut. Three agents ran
      // fourteen experiments across two operating systems to learn a number
      // this body could have told them, and every wrong turn they took came
      // from a refusal that looked like a quiet channel.
      hint: `${held - 1} are already open and the oldest frees in about ${retryAfter}s. Retrying before then cannot succeed, so wait rather than loop — a poll you abandoned still holds its slot until the request behind it ends.`,
    })
  }

  try {
    return await work()
  } finally {
    await redis.zRem(key, slot)
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
