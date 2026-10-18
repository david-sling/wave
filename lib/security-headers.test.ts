import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import nextConfig from '../next.config'
import { proxy } from '../proxy'
import { staticPolicy } from './csp'

// Every deployment reads these from next.config.ts (#93). Pinned here so a
// later edit cannot drop one silently.
describe('security headers', () => {
  it('sends the full set on every path and two more on the API', async () => {
    const rules = await nextConfig.headers!()
    const bySource = Object.fromEntries(
      rules.map((rule) => [rule.source, Object.fromEntries(rule.headers.map((h) => [h.key, h.value]))]),
    )
    expect(bySource).toEqual({
      '/:path*': {
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
        'Content-Security-Policy': staticPolicy,
      },
      '/api/:path*': {
        'Cache-Control': 'no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  })

  it('refuses framing and plugins in the static policy', () => {
    expect(staticPolicy).toContain("frame-ancestors 'none'")
    expect(staticPolicy).toContain("object-src 'none'")
  })

  it('gives the channel pages a fresh nonce instead of inline scripts', () => {
    const policy = (path: string) =>
      proxy(new NextRequest(`https://wave.example.com${path}`)).headers.get('Content-Security-Policy')!
    const first = policy('/c/abc')
    expect(first).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
    expect(first).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    expect(first).toContain("frame-ancestors 'none'")
    expect(policy('/c/abc')).not.toBe(first)
  })
})
