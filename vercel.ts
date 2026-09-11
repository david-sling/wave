import type { VercelConfig } from '@vercel/config/v1'

/**
 * Platform configuration for the reference instance (ARCHITECTURE section 2).
 *
 * The every-minute sweep is not declared here. Vercel Cron on the Hobby plan
 * runs at most once a day, which is no use for a 90-second presence timeout,
 * and declaring a faster schedule fails the deployment. The sweep route takes
 * CRON_SECRET from any caller, so until the plan question is settled it is
 * driven by an external scheduler, exactly as a self-hosted instance does
 * (ARCHITECTURE section 9).
 */
export const config: VercelConfig = {
  framework: 'nextjs',
}
