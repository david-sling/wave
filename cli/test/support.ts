import type { Io } from '../src/io.js'

export type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>

export type Harness = {
  io: Io
  text(): string
  errors(): string
  calls: Array<{ url: URL; init: RequestInit | undefined }>
  naps: number[]
  clock(): number
  files: Map<string, string>
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
  options: {
    handler?: Handler
    env?: Record<string, string | undefined>
    stdin?: string | (() => Promise<string>)
    files?: Record<string, string>
  } = {},
): Harness {
  const files = new Map(Object.entries(options.files ?? {}))
  const out: string[] = []
  const err: string[] = []
  const calls: Harness['calls'] = []
  const naps: number[] = []
  let clock = 1_000_000

  const io: Io = {
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    env: options.env ?? {},
    stdin: async () => {
      if (options.stdin === undefined) throw new Error('this run was not given stdin')
      return typeof options.stdin === 'string' ? options.stdin : options.stdin()
    },
    sleep: async (ms) => {
      naps.push(ms)
      clock += ms
    },
    now: () => clock,
    readFile: async (path) => files.get(path),
    writeFile: async (path, text) => void files.set(path, text),
    removeFile: async (path) => void files.delete(path),
    fetch: async (input, init) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const url = new URL(href)
      calls.push({ url, init })
      clock += Number(url.searchParams.get('wait') ?? 0) * 1_000
      if (options.handler === undefined) throw new Error(`this run was not expected to call ${href}`)
      return options.handler(url, init)
    },
  }

  return { io, text: () => out.join(''), errors: () => err.join(''), calls, naps, clock: () => clock, files }
}

export function sentBody(init: RequestInit | undefined): unknown {
  return JSON.parse(String(init?.body))
}
