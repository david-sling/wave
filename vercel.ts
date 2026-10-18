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
 * Security headers live in next.config.ts, which every deployment reads; this
 * file is read only by Vercel (#93).
 */
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [{ path: '/api/cron/sweep', schedule: '0 4 * * *' }],
  functions: {
    // The long-poll holds a request for up to 50 seconds; 60 covers it with margin.
    'app/api/v1/channels/[id]/messages/route.ts': { maxDuration: 60 },
  },
}
