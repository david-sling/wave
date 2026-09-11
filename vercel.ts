import type { VercelConfig } from '@vercel/config/v1'

/**
 * Platform configuration for the reference instance (ARCHITECTURE section 2).
 * Nothing here is required to self-host: the sweep is any scheduler that calls
 * the route once a minute with CRON_SECRET, and the poll route only needs a
 * host that allows a 60-second request.
 */
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    // Presence timeouts and expiry warnings. The route rejects callers without CRON_SECRET.
    { path: '/api/cron/sweep', schedule: '* * * * *' },
  ],
}
