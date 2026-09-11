/**
 * Instance configuration. Every value comes from the environment so a
 * self-hosted instance is configured the same way as the reference one
 * (ARCHITECTURE section 9).
 *
 * Reading is lazy and memoised: a missing variable fails the first request
 * that needs it with a message naming the variable, not the build.
 */

export type Config = {
  /** Public origin of this instance, no trailing slash. Used in the join prompt and channel URLs. */
  host: string
  /** Redis 6+ connection string. */
  redisUrl: string
  /** Shared secret the sweep route requires from its scheduler. */
  cronSecret: string
  /** Which bot check guards channel creation. Self-hosted instances may run without one. */
  botCheck: BotCheck
}

/** `botid` uses Vercel BotID. `off` accepts every creation request. */
export const BOT_CHECKS = ['botid', 'off'] as const
export type BotCheck = (typeof BOT_CHECKS)[number]

/** Thrown when the environment cannot produce a usable config. Never contains a value. */
export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid instance configuration:\n- ${problems.join('\n- ')}`)
    this.name = 'ConfigError'
  }
}

const MIN_CRON_SECRET_LENGTH = 16

function readHost(raw: string | undefined, problems: string[]): string {
  if (!raw) {
    problems.push('HOST is not set. Use the public origin of this instance, e.g. https://wave.example.com')
    return ''
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    problems.push('HOST is not a URL. Use an absolute origin, e.g. https://wave.example.com')
    return ''
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    problems.push('HOST must use http or https')
    return ''
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    problems.push('HOST must be an origin with no path, query, or fragment')
    return ''
  }
  return url.origin
}

function readRedisUrl(raw: string | undefined, problems: string[]): string {
  if (!raw) {
    problems.push('REDIS_URL is not set')
    return ''
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    problems.push('REDIS_URL is not a URL. Expected redis://host:port or rediss://host:port')
    return ''
  }
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    problems.push('REDIS_URL must start with redis:// or rediss://')
    return ''
  }
  return raw
}

function readBotCheck(raw: string | undefined, problems: string[]): BotCheck {
  if (!raw) return 'off'
  if (!(BOT_CHECKS as readonly string[]).includes(raw)) {
    problems.push(`BOT_CHECK must be one of: ${BOT_CHECKS.join(', ')}`)
    return 'off'
  }
  return raw as BotCheck
}

function readCronSecret(raw: string | undefined, problems: string[]): string {
  if (!raw) {
    problems.push('CRON_SECRET is not set. Generate one with: openssl rand -base64 32')
    return ''
  }
  if (raw.length < MIN_CRON_SECRET_LENGTH) {
    problems.push(`CRON_SECRET is shorter than ${MIN_CRON_SECRET_LENGTH} characters`)
    return ''
  }
  return raw
}

/** Reads and validates a config from an arbitrary environment. Exported for tests. */
export function readConfig(env: Record<string, string | undefined>): Config {
  const problems: string[] = []
  const config: Config = {
    host: readHost(env.HOST, problems),
    redisUrl: readRedisUrl(env.REDIS_URL, problems),
    cronSecret: readCronSecret(env.CRON_SECRET, problems),
    botCheck: readBotCheck(env.BOT_CHECK, problems),
  }
  if (problems.length > 0) throw new ConfigError(problems)
  return config
}

let cached: Config | undefined

/** The instance config, read once per process. Throws {@link ConfigError} when the environment is incomplete. */
export function getConfig(): Config {
  cached ??= readConfig(process.env)
  return cached
}

/** Test seam: drops the memoised config so the next call re-reads the environment. */
export function resetConfigForTests(): void {
  cached = undefined
}
