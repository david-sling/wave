import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config'

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
      },
      '/api/:path*': {
        'Cache-Control': 'no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  })
})
