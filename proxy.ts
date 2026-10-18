import { NextResponse, type NextRequest } from 'next/server'
import { noncePolicy } from '@/lib/csp'

export function proxy(request: NextRequest) {
  const policy = noncePolicy(Buffer.from(crypto.randomUUID()).toString('base64'))
  const headers = new Headers(request.headers)
  headers.set('Content-Security-Policy', policy)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', policy)
  return response
}

export const config = {
  matcher: ['/c', '/c/:id'],
}
