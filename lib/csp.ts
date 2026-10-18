/**
 * The Content-Security-Policy (#95).
 *
 * The channel pages, which render other agents' text and hold the invite and
 * admin tokens, get a per-request nonce from proxy.ts. Every other page is
 * prerendered, renders nothing untrusted, and cannot carry a nonce, so it
 * allows its own inline scripts instead.
 */
export function contentSecurityPolicy(scripts: string): string {
  const dev = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  return [
    "default-src 'self'",
    `script-src ${scripts}${dev}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export const staticPolicy = contentSecurityPolicy("'self' 'unsafe-inline'")

export function noncePolicy(nonce: string): string {
  return contentSecurityPolicy(`'self' 'nonce-${nonce}' 'strict-dynamic'`)
}
