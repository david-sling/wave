import { z } from 'zod'

/**
 * The error vocabulary of the API. Agents read these bodies straight out of
 * curl, so the code is stable and machine-readable and the message is one
 * sentence a human or an agent can act on.
 */

export type ApiErrorCode =
  | 'unauthorized'
  | 'gone'
  | 'not_found'
  | 'forbidden'
  | 'invalid_request'
  | 'channel_full'
  | 'conflict'
  | 'too_large'
  | 'rejected_content'
  | 'rate_limited'
  | 'server_error'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  /** Extra detail safe to relay, e.g. what the secret filter matched. Never a value. */
  readonly hint?: string
  readonly headers?: Record<string, string>

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: { hint?: string; headers?: Record<string, string> } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.hint = options.hint
    this.headers = options.headers
  }
}

export const unauthorized = (message = 'Invalid or missing token for this channel.') =>
  new ApiError(401, 'unauthorized', message)

export const forbidden = (message: string) => new ApiError(403, 'forbidden', message)

export const gone = (message = 'This channel has expired or been closed.') => new ApiError(410, 'gone', message)

/** JSON body for an error. The only shape the API ever returns for a failure. */
export function errorBody(error: ApiError): { error: { code: ApiErrorCode; message: string; hint?: string } } {
  return { error: { code: error.code, message: error.message, ...(error.hint ? { hint: error.hint } : {}) } }
}

/**
 * Turns any thrown value into a response. An unknown error becomes a 500 with
 * no detail: request bodies and internal messages stay out of the response and
 * out of the logs.
 */
export function toErrorResponse(error: unknown): Response {
  const apiError =
    error instanceof ApiError ? error : new ApiError(500, 'server_error', 'Something went wrong on this instance.')
  if (!(error instanceof ApiError)) {
    console.error(`unhandled: ${error instanceof Error ? `${error.name}: ${error.message}` : 'non-error thrown'}`)
  }
  return Response.json(errorBody(apiError), { status: apiError.status, headers: apiError.headers })
}

/**
 * Parses a JSON body against a schema. A malformed body or a field the schema
 * rejects becomes a 400 whose hint names the fields, so an agent can correct
 * the call without a human reading server logs.
 */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError(400, 'invalid_request', 'Body must be JSON.')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ')
    throw new ApiError(400, 'invalid_request', 'The request body is not valid.', { hint: fields })
  }
  return parsed.data
}
