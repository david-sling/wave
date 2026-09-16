import { createHash } from 'node:crypto'

/**
 * The session string (ARCHITECTURE section 11).
 *
 * The CLI keeps no state: no session file, no cursor file, no `~/.wave`. What
 * ties one invocation to the next is this one opaque token, printed by `join`
 * and handed back to every later command. An earlier draft of the design kept
 * a file per channel, which handles worst exactly the case that matters most —
 * two agents in the same channel on one machine, sharing one file, the second
 * join overwriting the first one's token. A string belongs to the process
 * holding it, so concurrency stops being a matter of file naming.
 */

export type Session = {
  /** Origin of the instance, no trailing slash. */
  host: string
  channel_id: string
  participant_id: string
  token: string
  /** `e2ee` channels only (section 12). Carried, never yet used. */
  key?: string
}

export class SessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionError'
  }
}

const PREFIX = 'wv1'

/**
 * Enough to catch a string cut short by a scrollback, a line wrap, or a
 * half-remembered copy. It is not a signature and does not pretend to be one:
 * anyone who can rewrite the payload can rewrite this too. What it buys is a
 * clear "this string is damaged" instead of a confusing 401 three calls later.
 */
const CHECKSUM_LENGTH = 8

const checksum = (payload: string) => createHash('sha256').update(payload).digest('hex').slice(0, CHECKSUM_LENGTH)

/** Long enough for any real id or token, short enough to refuse a pasted file. */
const MAX_FIELD_LENGTH = 512

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SessionError(`This session string is missing its ${field}. Join again to get a new one.`)
  }
  return value
}

/**
 * Ids, tokens and keys are printable ASCII with no spaces, and are held to it.
 * The session string is composed into a command line an agent writes, so a
 * space or a control character inside one would split the argument rather than
 * fail, and the damage would surface as a 401 somewhere else entirely.
 */
function requireToken(value: unknown, field: string): string {
  const text = requireString(value, field)
  if (text.length > MAX_FIELD_LENGTH || !/^[\x21-\x7e]+$/.test(text)) {
    throw new SessionError(`This session string has a ${field} that cannot be right. Join again to get a new one.`)
  }
  return text
}

/**
 * The host as an origin. A path, a query or a fragment here would mean the
 * caller kept a channel URL where an origin belongs, and every later request
 * would be built against the wrong base.
 */
export function normalizeHost(host: string): string {
  let url: URL
  try {
    url = new URL(host)
  } catch {
    throw new SessionError(`Not a URL: ${host}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SessionError(`A Wave host must be http or https, and this is ${url.protocol.replace(':', '')}: ${host}`)
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new SessionError(`A Wave host is an origin with nothing after it, and this has more: ${host}`)
  }
  return url.origin
}

export function encodeSession(session: Session): string {
  const fields: Record<string, string> = {
    host: normalizeHost(requireString(session.host, 'host')),
    channel_id: requireToken(session.channel_id, 'channel id'),
    participant_id: requireToken(session.participant_id, 'participant id'),
    token: requireToken(session.token, 'token'),
  }
  if (session.key !== undefined) fields.key = requireToken(session.key, 'key')

  const payload = Buffer.from(JSON.stringify(fields), 'utf8').toString('base64url')
  return `${PREFIX}.${payload}.${checksum(payload)}`
}

const damaged = (what: string) =>
  new SessionError(
    `This session string is ${what}. Pass the whole line that \`wave join\` printed, or join again for a new one.`,
  )

export function decodeSession(value: string): Session {
  const parts = value.trim().split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    throw new SessionError(
      'That is not a Wave session string. It is the line `wave join` prints, and it starts with `wv1.`.',
    )
  }

  const payload = parts[1]!
  const given = parts[2]!
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw damaged('damaged')
  // Over the encoded payload rather than the decoded fields, so a string that
  // was re-spelled as well as one that was cut short fails here.
  if (given !== checksum(payload)) throw damaged('damaged or cut short')

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    throw damaged('damaged')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw damaged('damaged')

  const fields = parsed as Record<string, unknown>
  const session: Session = {
    host: normalizeHost(requireString(fields.host, 'host')),
    channel_id: requireToken(fields.channel_id, 'channel id'),
    participant_id: requireToken(fields.participant_id, 'participant id'),
    token: requireToken(fields.token, 'token'),
  }
  if (fields.key !== undefined) session.key = requireToken(fields.key, 'key')
  return session
}
