import { boolean, optionalCount, parseArgs, sessionFrom } from '../args.js'
import { ApiError, NetworkError, WaveClient } from '../client.js'
import type { Command } from '../commands.js'
import { EXIT } from '../exit.js'
import type { Io } from '../io.js'
import { renderRound } from '../render.js'
import type { Session } from '../session.js'
import type { Item } from '../types.js'

/**
 * `wave wait --session <s> --after <seq> [--timeout <s>] [--json]`
 * `wave tail --session <s> --after <seq> [--json]`
 *
 * The command the CLI exists for. One agent tool call covers a whole wait,
 * where curl needs one per poll: `wait` reissues held polls internally until
 * something arrives from someone else. `tail` is the same loop that never
 * stops, for a person at a terminal or an agent reading a stream.
 *
 * Nothing here handles a signal. A run cut short prints no cursor line
 * because the cursor is the last thing written, so whatever killed the process
 * killed it before the advance, and the caller keeps the `--after` it already
 * had and sees the same items again rather than losing them. That is the
 * correct failure and it needs no code to arrange.
 */

/** The instance's own cap (LIMITS.maxWaitSeconds). Asking for more is clamped there anyway. */
const MAX_POLL_SECONDS = 50

/** The prompt's 15-minute budget. */
const DEFAULT_TIMEOUT_SECONDS = 900

const BACKOFF_START_MS = 1_000
const BACKOFF_CAP_MS = 60_000

const WAIT_SPEC = { session: 'value', after: 'value', timeout: 'value', json: 'boolean' } as const
// No `--timeout`: a tail that stopped on one would be a `wait` with a worse
// name, and an agent that passed one should be told it does nothing here.
const TAIL_SPEC = { session: 'value', after: 'value', json: 'boolean' } as const

type WatchOptions = {
  io: Io
  client: WaveClient
  session: Session
  after: number
  json: boolean
  /** Absolute milliseconds. `tail` has none. */
  deadline?: number
  /** `wait` returns on the first item from someone else; `tail` keeps going. */
  stopOnFirst: boolean
}

/**
 * Items from this participant are skipped in the output and never in the
 * cursor. The CLI knows its own id because the session string carries it, so
 * this stays out of the agent's hands — and skipping them in the cursor too
 * would mean re-reading them forever.
 *
 * System items have a subject rather than an author, so an agent still sees
 * its own arrival announced, exactly as the join prompt's jq line leaves it.
 */
function fromOthers(items: Item[], selfId: string): Item[] {
  return items.filter((item) => item.type !== 'message' || item.from.id !== selfId)
}

async function watch(options: WatchOptions): Promise<number> {
  const { io, client, session, json, stopOnFirst, deadline } = options
  let cursor = options.after
  let backoff = BACKOFF_START_MS
  let polled = false

  for (;;) {
    const remaining = deadline === undefined ? Number.POSITIVE_INFINITY : deadline - io.now()
    // Never before the first poll, so `--timeout 0` is one immediate read of
    // whatever is already there rather than a run that asks nothing.
    if (remaining <= 0 && polled) {
      // Nothing came, and the line still prints so there is always exactly one
      // line to carry forward.
      io.out(renderRound([], cursor, { json }))
      return EXIT.timeout
    }

    const hold = Math.min(MAX_POLL_SECONDS, Math.max(0, Math.floor(remaining / 1_000)))

    let response
    polled = true
    try {
      response = await client.poll({ after: cursor, wait: hold })
    } catch (error) {
      const napMs = pauseFor(error, backoff)
      if (napMs === undefined) throw error
      backoff = Math.min(backoff * 2, BACKOFF_CAP_MS)
      io.err(`wave: ${error instanceof Error ? error.message : String(error)} — retrying in ${Math.round(napMs / 1_000)}s\n`)
      await io.sleep(napMs)
      continue
    }

    backoff = BACKOFF_START_MS
    cursor = response.last_seq
    const items = fromOthers(response.items, session.participant_id)
    if (items.length === 0) continue

    io.out(renderRound(items, cursor, { json }))
    if (stopOnFirst) return EXIT.ok
  }
}

/**
 * How long to wait before trying again, or `undefined` for a failure that
 * waiting does not fix. A 410 or a 401 is final, and a 400 is this client
 * asking wrongly; only the wire and the instance's own overload are retried.
 */
function pauseFor(error: unknown, backoff: number): number | undefined {
  if (error instanceof NetworkError) return backoff
  if (!(error instanceof ApiError)) return undefined
  // Told rather than guessed: the instance knows how long its own limit has
  // left to run, and this is the one place a client can be exactly right.
  if (error.status === 429) return Math.min((error.retryAfter ?? backoff / 1_000) * 1_000, BACKOFF_CAP_MS)
  return error.status >= 500 ? backoff : undefined
}

function start(argv: string[], io: Io, spec: Record<string, 'value' | 'boolean'>) {
  const args = parseArgs(argv, spec)
  const session = sessionFrom(args, io.env)
  return {
    io,
    client: WaveClient.forSession(session, io),
    session,
    after: optionalCount(args, 'after') ?? 0,
    json: boolean(args, 'json'),
    timeout: optionalCount(args, 'timeout'),
  }
}

export const wait: Command = {
  summary: 'hold until someone else says something, print it, and print the next cursor',

  async run(argv, io) {
    const { timeout, ...rest } = start(argv, io, WAIT_SPEC)
    const seconds = timeout ?? DEFAULT_TIMEOUT_SECONDS
    return watch({ ...rest, stopOnFirst: true, deadline: io.now() + seconds * 1_000 })
  },
}

export const tail: Command = {
  summary: 'the same, but keep printing until you stop it',

  async run(argv, io) {
    const { timeout: _timeout, ...rest } = start(argv, io, TAIL_SPEC)
    return watch({ ...rest, stopOnFirst: false })
  },
}
