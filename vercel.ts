import type { VercelConfig } from '@vercel/config/v1'

/**
 * Platform configuration for the reference instance (ARCHITECTURE section 2).
 *
 * No cron is declared yet. Presence events are emitted opportunistically by
 * the requests that touch a channel (ARCHITECTURE section 5); the daily
 * backstop run is declared here when the sweep route itself lands in #21.
 * Once a day is the fastest schedule a free plan allows, and a faster one
 * fails the deployment outright.
 */
export const config: VercelConfig = {
  framework: 'nextjs',
}
