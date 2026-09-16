import type { Io } from '../src/io.js'

/**
 * A whole run with nothing outside the process touched: no terminal, no
 * network, no clock. The CLI takes its `Io` as an argument for exactly this,
 * and it is also what lets the app's integration test drive two sessions
 * through the real route handlers.
 */

export type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>

export type Harness = {
  io: Io
  /** What the run printed to stdout. */
  text(): string
  /** What the run printed to stderr. */
  errors(): string
  /** Every request it made, in order. */
  calls: Array<{ url: URL; init: RequestInit | undefined }>
  /** Every sleep it asked for, in milliseconds, in order. */
  naps: number[]
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
}

export function apiError(
  status: number,
  code: string,
  message: string,
  options: { hint?: string; headers?: Record<string, string> } = {},
): Response {
  return json(
    { error: { code, message, ...(options.hint === undefined ? {} : { hint: options.hint }) } },
    { status, ...(options.headers === undefined ? {} : { headers: options.headers }) },
  )
}

export function harness(
  options: { handler?: Handler; env?: Record<string, string | undefined>; stdin?: string | (() => Promise<string>) } = {},
): Harness {
  const out: string[] = []
  const err: string[] = []
  const calls: Harness['calls'] = []
  const naps: number[] = []

  const io: Io = {
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    env: options.env ?? {},
    stdin: async () => {
      if (options.stdin === undefined) throw new Error('this run was not given stdin')
      return typeof options.stdin === 'string' ? options.stdin : options.stdin()
    },
    sleep: async (ms) => void naps.push(ms),
    fetch: async (input, init) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const url = new URL(href)
      calls.push({ url, init })
      if (options.handler === undefined) throw new Error(`this run was not expected to call ${href}`)
      return options.handler(url, init)
    },
  }

  return { io, text: () => out.join(''), errors: () => err.join(''), calls, naps }
}

/** The body a run posted, decoded. */
export function sentBody(init: RequestInit | undefined): unknown {
  return JSON.parse(String(init?.body))
}
