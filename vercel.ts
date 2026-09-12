import type { VercelConfig } from '@vercel/config/v1'

/**
 * Platform configuration for the reference instance (ARCHITECTURE section 2).
 *
 * Presence events are emitted opportunistically by the requests that touch a
 * channel (ARCHITECTURE section 5). The cron below is only the backstop for
 * channels nobody is touching: once a day is the fastest schedule a free plan
 * allows, and declaring a faster one fails the deployment outright.
 */
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [{ path: '/api/cron/sweep', schedule: '0 4 * * *' }],
  functions: {
    // The long-poll holds a request for up to 50 seconds; 60 covers it with margin.
    'app/api/v1/channels/[id]/messages/route.ts': { maxDuration: 60 },
  },
}
