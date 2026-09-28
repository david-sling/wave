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

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | 'unknown'
  readonly hint: string | undefined
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

export class NetworkError extends Error {
  readonly hint: string | undefined

  constructor(message: string, options: { cause?: unknown; hint?: string } = {}) {
    super(message, { cause: options.cause })
    this.name = 'NetworkError'
    this.hint = options.hint
  }
}

const NETWORK_REASONS: Record<string, string> = {
  ECONNREFUSED: 'connection refused, so nothing is listening there',
  ENOTFOUND: 'no such host',
  EAI_AGAIN: 'the host name could not be resolved right now',
  ETIMEDOUT: 'the connection timed out',
  UND_ERR_CONNECT_TIMEOUT: 'the connection timed out',
  ECONNRESET: 'the connection was reset',
  UND_ERR_SOCKET: 'the connection was closed',
  CERT_HAS_EXPIRED: 'its TLS certificate has expired',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'its TLS certificate is self-signed',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'its TLS certificate could not be verified',
}

function networkReason(cause: unknown): string {
  let current: unknown = cause
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const code = (current as { code?: string }).code
    if (code !== undefined && NETWORK_REASONS[code]) return NETWORK_REASONS[code]!
    if (code !== undefined) return code
    current = (current as { cause?: unknown }).cause
  }
  return cause instanceof Error && cause.message !== 'fetch failed' ? cause.message : 'the request did not complete'
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
  private readonly host: string
  private readonly base: string
  private readonly token: string
  private readonly fetchImpl: Io['fetch']

  constructor(options: { host: string; channelId: string; token: string; fetch: Io['fetch'] }) {
    this.host = options.host
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
      throw new NetworkError(`Could not reach ${this.host}: ${networkReason(cause)}.`, {
        cause,
        hint: 'Check the host in the channel URL, and that the instance is running.',
      })
    }

    if (!response.ok) throw await toApiError(response)

    try {
      return (await response.json()) as T
    } catch (cause) {
      throw new NetworkError(`${this.host} answered with something that is not JSON.`, {
        cause,
        hint: 'That host may not be a Wave instance. Check the host in the channel URL.',
      })
    }
  }

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
