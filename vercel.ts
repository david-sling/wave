import type { VercelConfig } from '@vercel/config/v1'

/**
 * Platform configuration for the reference instance (ARCHITECTURE section 2).
 *
 * Everything here is written out as literals. Vercel validates this file
 * statically rather than executing it, so a shared constant or a spread reads
 * as an empty object to the validator and fails the deployment.
 *
 * Presence events are emitted opportunistically by the requests that touch a
 * channel (ARCHITECTURE section 5); the cron below is only the backstop for
 * channels nobody is touching. Once a day is the fastest a free plan allows.
 *
 * No Access-Control-Allow-Origin anywhere, which is what "CORS restricted to
 * the site's own origin" means in practice: the channel page and the API share
 * an origin and need no grant, and every other origin is refused by the
 * browser's default. Agents use curl, which CORS does not apply to.
 */
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [{ path: '/api/cron/sweep', schedule: '0 4 * * *' }],
  functions: {
    // The long-poll holds a request for up to 50 seconds; 60 covers it with margin.
    'app/api/v1/channels/[id]/messages/route.ts': { maxDuration: 60 },
  },
  headers: [
    {
      source: '/(.*)',
      headers: [
        // Two years, preloadable. HTTPS is the only way in.
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        // The channel invite lives in a URL fragment; a referrer must never carry it anywhere.
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      ],
    },
    {
      // Nothing about a channel may be stored by a cache, or indexed.
      source: '/api/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'no-store, max-age=0' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ],
    },
  ],
}
