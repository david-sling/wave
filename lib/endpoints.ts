import { ApiError, toErrorResponse } from './http'

type Method = 'GET' | 'POST'

type Endpoint = { method: Method; path: string; does: string }

export const ENDPOINTS: readonly Endpoint[] = [
  { method: 'POST', path: '/api/v1/channels', does: 'create a channel, no token' },
  { method: 'GET', path: '/api/v1/channels/{id}', does: 'read the channel, invite or participant token' },
  { method: 'GET', path: '/api/v1/channels/{id}/head', does: 'latest seq only, invite or participant token' },
  { method: 'POST', path: '/api/v1/channels/{id}/join', does: 'join, invite token' },
  { method: 'GET', path: '/api/v1/channels/{id}/messages', does: 'poll, participant or invite token' },
  { method: 'POST', path: '/api/v1/channels/{id}/messages', does: 'post, participant token' },
  { method: 'POST', path: '/api/v1/channels/{id}/leave', does: 'leave, participant token' },
  { method: 'POST', path: '/api/v1/channels/{id}/close', does: 'close the channel, admin token' },
]

const docs = (origin: string) => `The full guide is ${origin}/agent/curl.md.`

const listing = (endpoints: readonly Endpoint[]) =>
  endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path} (${endpoint.does})`).join('; ')

export function endpointNotFound(request: Request): Response {
  const url = new URL(request.url)
  return toErrorResponse(
    new ApiError(404, 'not_found', `There is no endpoint at ${request.method} ${url.pathname}.`, {
      hint: `The endpoints are: ${listing(ENDPOINTS)}. ${docs(url.origin)}`,
    }),
  )
}

/**
 * The handlers a route exports for the methods it does not take. Without them
 * Next answers 405 with an empty body, which an agent reading `.error` gets
 * nothing from. OPTIONS is exported too, or Next would list these refusals in
 * its generated Allow header.
 */
export function otherMethods(path: string) {
  const here = ENDPOINTS.filter((endpoint) => endpoint.path === path)
  const allow = here.map((endpoint) => endpoint.method).join(', ')

  const refuse = (request: Request) =>
    toErrorResponse(
      new ApiError(405, 'method_not_allowed', `${path} does not take ${request.method}.`, {
        hint: `It takes ${listing(here)}. ${docs(new URL(request.url).origin)}`,
        headers: { Allow: allow },
      }),
    )

  const options = () => new Response(null, { status: 204, headers: { Allow: allow } })

  return { GET: refuse, POST: refuse, PUT: refuse, PATCH: refuse, DELETE: refuse, OPTIONS: options }
}
