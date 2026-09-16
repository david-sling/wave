import type { Io } from './io.js'
import type { Session } from './session.js'
import { VERSION } from './version.js'
import type {
  ApiErrorCode,
  ChannelView,
  JoinResponse,
  LeaveResponse,
  MessageKind,
  PollResponse,
  PostResponse,
} from './types.js'

/** The v1 API, and nothing else. No endpoint here is new for this client. */

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | 'unknown'
  readonly hint: string | undefined
  /** Seconds, from `Retry-After`, when the API named one. */
  readonly retryAfter: number | undefined

  constructor(
    status: number,
    code: ApiErrorCode | 'unknown',
    message: string,
    options: { hint?: string; retryAfter?: number } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.hint = options.hint
    this.retryAfter = options.retryAfter
  }
}

/** The request never reached an answer: DNS, TLS, a dropped socket, a proxy. */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NetworkError'
  }
}

export type PostBody = {
  text: string
  kind?: MessageKind
  reply_to?: number
  client_id?: string
}

export type JoinBody = {
  name: string
  role: 'agent' | 'human'
  client?: string
}

function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  if (header === null) return undefined
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfter = retryAfterSeconds(response)
  let body: unknown
  try {
    body = await response.json()
  } catch {
    // An error that is not the API's own shape — a proxy, a gateway, an
    // instance that fell over. The status is the only honest thing to report.
    return new ApiError(response.status, 'unknown', `The instance answered ${response.status}.`, { retryAfter })
  }
  const error = (body as { error?: { code?: string; message?: string; hint?: string } } | null)?.error
  if (!error?.message) {
    return new ApiError(response.status, 'unknown', `The instance answered ${response.status}.`, { retryAfter })
  }
  return new ApiError(response.status, (error.code ?? 'unknown') as ApiErrorCode, error.message, {
    ...(error.hint === undefined ? {} : { hint: error.hint }),
    ...(retryAfter === undefined ? {} : { retryAfter }),
  })
}

export function channelBase(host: string, channelId: string): string {
  return `${host}/api/v1/channels/${encodeURIComponent(channelId)}`
}

export class WaveClient {
  private readonly base: string
  private readonly token: string
  private readonly fetchImpl: Io['fetch']

  constructor(options: { host: string; channelId: string; token: string; fetch: Io['fetch'] }) {
    this.base = channelBase(options.host, options.channelId)
    this.token = options.token
    this.fetchImpl = options.fetch
  }

  static forSession(session: Session, io: Io): WaveClient {
    return new WaveClient({
      host: session.host,
      channelId: session.channel_id,
      token: session.token,
      fetch: io.fetch,
    })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.token}`,
          'user-agent': `wave-cli/${VERSION}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...init.headers,
        },
      })
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : 'The request did not complete.', { cause })
    }

    if (!response.ok) throw await toApiError(response)

    try {
      return (await response.json()) as T
    } catch (cause) {
      throw new NetworkError('The instance answered with something that is not JSON.', { cause })
    }
  }

  /** The token here is the invite, not a participant token. */
  join(body: JoinBody): Promise<JoinResponse> {
    return this.request('/join', { method: 'POST', body: JSON.stringify(body) })
  }

  post(body: PostBody): Promise<PostResponse> {
    return this.request('/messages', { method: 'POST', body: JSON.stringify(body) })
  }

  poll(options: { after: number; wait: number; signal?: AbortSignal }): Promise<PollResponse> {
    const query = new URLSearchParams({ after: String(options.after), wait: String(options.wait) })
    return this.request(`/messages?${query}`, options.signal ? { signal: options.signal } : {})
  }

  leave(): Promise<LeaveResponse> {
    return this.request('/leave', { method: 'POST' })
  }

  channel(): Promise<ChannelView> {
    return this.request('')
  }
}
