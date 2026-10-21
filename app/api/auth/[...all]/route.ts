import { toNextJsHandler } from 'better-auth/next-js'
import { getAuth } from '@/lib/accounts/auth'
import { endpointNotFound } from '@/lib/endpoints'
import { toErrorResponse } from '@/lib/http'

/**
 * Sign-in, where the library is mounted (ARCHITECTURE section 14). With
 * sign-in off every path here is the same 404 as any other unknown /api
 * path, so nothing reveals that the instance could sign anyone in.
 */
function handler(method: 'GET' | 'POST') {
  return async (request: Request): Promise<Response> => {
    let auth
    try {
      auth = getAuth()
    } catch (error) {
      return toErrorResponse(error)
    }
    if (!auth) return endpointNotFound(request)
    return toNextJsHandler(auth)[method](request)
  }
}

export const GET = handler('GET')
export const POST = handler('POST')
