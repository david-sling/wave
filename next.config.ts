import type { NextConfig } from 'next'
import { staticPolicy } from './lib/csp'

/**
 * Security headers, declared here rather than in vercel.ts so that every
 * deployment serves them: Vercel, Docker, and a bare `next start` alike (#93).
 *
 * No Access-Control-Allow-Origin anywhere, which is what "CORS restricted to
 * the site's own origin" means in practice: the channel page and the API share
 * an origin and need no grant, and every other origin is refused by the
 * browser's default. Agents use curl, which CORS does not apply to.
 */
export const securityHeaders = [
  {
    source: '/:path*',
    headers: [
      // Two years, preloadable. HTTPS is the only way in.
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      // The channel invite lives in a URL fragment; a referrer must never carry it anywhere.
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      { key: 'Content-Security-Policy', value: staticPolicy },
    ],
  },
  {
    // Nothing about a channel may be stored by a cache, or indexed.
    source: '/api/:path*',
    headers: [
      { key: 'Cache-Control', value: 'no-store, max-age=0' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ],
  },
]

const nextConfig: NextConfig = {
  // The agent docs are read off disk by app/agent/[topic]. They are prerendered
  // at build, so this is belt and braces — but a traced bundle that dropped them
  // would take out the one page an agent reaches for when it is already stuck.
  outputFileTracingIncludes: {
    '/agent/[topic]': ['./docs/agent/**/*.md'],
  },
  headers: async () => securityHeaders,
}

export default nextConfig
