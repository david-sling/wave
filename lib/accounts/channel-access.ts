import type { Pool } from 'pg'
import { loadChannel, type AuthContext } from '../auth.ts'
import { forbidden, unauthorized } from '../http.ts'
import { keys } from '../keys.ts'
import type { WaveRedis } from '../redis.ts'
import { SESSION_AUTH_HEADER, SESSION_AUTH_VALUE } from '../session-auth.ts'
import { parseParticipant, type ParticipantRecord } from '../types.ts'
import { getAccountSession } from './auth.ts'
import { openAccountChannel } from './channels.ts'
import { accountSecret, getPool } from './store.ts'

/**
 * Access for a signed-in page, on /api/web only (AUTH.md 3.6, ARCHITECTURE 14).
 *
 * A signed-in page holds no channel key. It marks its requests with
 * SESSION_AUTH_HEADER and sends its session cookie, and each request is
 * answered from the account: the session names the account, the account's row
 * names the channel and its seat, and the sealed invite must still match the
 * live channel. No token is read here, and no session is read under /api/v1,
 * which stays bearer-only (AUTH.md 2.4).
 */
export type SessionAccess = AuthContext & { accountId: string }

/** What the request may do: read the channel (as the account's seat, if it has one), or speak from that seat. */
export type SessionGrant = 'read' | 'seat'

/** Where the session and the store come from. A test seam: routes take the defaults. */
export type AccessDeps = {
  session: (headers: Headers) => Promise<{ user: { id: string } } | null>
  pool: () => Pool
  secret: () => string
}

const fromEnvironment: AccessDeps = { session: getAccountSession, pool: getPool, secret: accountSecret }

/**
 * A cookie rides along on any request to this origin, so the session is only
 * honoured from this origin's own pages: the custom header forces a preflight
 * no other origin can pass (nothing here sends CORS headers), and the fetch
 * metadata and Origin, when the browser sends them, must say the same.
 */
function fromOwnPage(request: Request): boolean {
  if (request.headers.get(SESSION_AUTH_HEADER) !== SESSION_AUTH_VALUE) return false
  const site = request.headers.get('sec-fetch-site')
  if (site !== null && site !== 'same-origin') return false
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== new URL(request.url).origin) return false
  return true
}

export async function authenticateSession(
  redis: WaveRedis,
  channelId: string,
  grant: SessionGrant,
  request: Request,
  deps: AccessDeps = fromEnvironment,
): Promise<SessionAccess> {
  if (!fromOwnPage(request)) throw forbidden('Session access is only for Wave pages on this origin.')
  const channel = await loadChannel(redis, channelId)
  const session = await deps.session(request.headers)
  if (!session) throw unauthorized('Signed out. Sign in again, or open the channel from its invite link.')
  // Not the account's channel reads the same as a wrong token: nothing about it is said.
  const opened = await openAccountChannel(deps.pool(), redis, deps.secret(), session.user.id, channel.id)
  if (!opened) throw unauthorized('This channel is not in your account.')

  const accountId = session.user.id
  const stored = opened.participantId ? await redis.hGet(keys.parts(channel.id), opened.participantId) : null
  const seat = stored ? parseParticipant(stored) : undefined
  const live = seat && seat.left_at === undefined ? seat : undefined
  // Reading carries the seat along when there is a live one, so a poll keeps it present.
  if (grant === 'read') return { channel: opened.channel, accountId, ...(live ? { participant: live } : {}) }
  if (seat?.left_at !== undefined) throw unauthorized('You have left this channel. Join again to continue.')
  if (!live) throw unauthorized('Your account has no seat in this channel yet. Join it first.')
  return { channel: opened.channel, participant: live, accountId }
}

/** The seat case, narrowed: callers get the participant, not an optional one. */
export async function authenticateSeat(
  redis: WaveRedis,
  channelId: string,
  request: Request,
  deps?: AccessDeps,
): Promise<SessionAccess & { participant: ParticipantRecord }> {
  const access = await authenticateSession(redis, channelId, 'seat', request, deps)
  if (!access.participant) throw unauthorized('Your account has no seat in this channel yet. Join it first.')
  return { ...access, participant: access.participant }
}
