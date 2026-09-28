import { boolean, optionalCount, parseArgs, sessionFrom } from '../args.js'
import { ApiError, NetworkError, WaveClient } from '../client.js'
import type { Command } from '../commands.js'
import { EXIT } from '../exit.js'
import type { Io } from '../io.js'
import { renderRound } from '../render.js'
import type { Session } from '../session.js'
import type { Item } from '../types.js'

const MAX_POLL_SECONDS = 50

const DEFAULT_TIMEOUT_SECONDS = 900

const BACKOFF_START_MS = 1_000
const BACKOFF_CAP_MS = 60_000

const WAIT_SPEC = { session: 'value', 'session-file': 'value', after: 'value', timeout: 'value', json: 'boolean' } as const
const TAIL_SPEC = { session: 'value', 'session-file': 'value', after: 'value', json: 'boolean' } as const

type WatchOptions = {
  io: Io
  client: WaveClient
  session: Session
  after: number
  json: boolean
  deadline?: number
  stopOnFirst: boolean
}

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
    // Checked only after the first poll, so `--timeout 0` still reads once.
    if (remaining <= 0 && polled) {
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

    const self = response.participants.find((participant) => participant.id === session.participant_id)
    const reader = self && { name: self.name, roster: response.participants.map((participant) => participant.name) }
    io.out(renderRound(items, cursor, { json, ...(reader ? { reader } : {}) }))
    if (stopOnFirst) return EXIT.ok
  }
}

function pauseFor(error: unknown, backoff: number): number | undefined {
  if (error instanceof NetworkError) return backoff
  if (!(error instanceof ApiError)) return undefined
  if (error.status === 429) return Math.min((error.retryAfter ?? backoff / 1_000) * 1_000, BACKOFF_CAP_MS)
  return error.status >= 500 ? backoff : undefined
}

async function start(argv: string[], io: Io, spec: Record<string, 'value' | 'boolean'>) {
  const args = parseArgs(argv, spec)
  const session = await sessionFrom(args, io)
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
  usage: 'wave wait -s <file> --after <seq> [--timeout <seconds>] [--json]',

  async run(argv, io) {
    const { timeout, ...rest } = await start(argv, io, WAIT_SPEC)
    const seconds = timeout ?? DEFAULT_TIMEOUT_SECONDS
    return watch({ ...rest, stopOnFirst: true, deadline: io.now() + seconds * 1_000 })
  },
}

export const tail: Command = {
  summary: 'the same, but keep printing until you stop it',
  usage: 'wave tail -s <file> --after <seq> [--json]',

  async run(argv, io) {
    const { timeout: _timeout, ...rest } = await start(argv, io, TAIL_SPEC)
    return watch({ ...rest, stopOnFirst: false })
  },
}
