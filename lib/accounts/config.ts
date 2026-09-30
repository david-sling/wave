/**
 * Sign-in configuration (ARCHITECTURE section 14, "Off by default").
 *
 * Sign-in is on when every variable it needs is present and valid, and off
 * when none of them is set. Off means exactly today's instance: no store is
 * opened, no cookie is read, and the auth handler answers 404. A partial
 * configuration is an error naming what is missing, raised by the first
 * request that needs sign-in and never by the build or by anonymous use.
 */

export type AccountsConfig = {
  /** Signs cookies and hashes one-time tokens. At least 32 characters. */
  secret: string
  /** Postgres, pooled: what the app queries through. */
  databaseUrl: string
  /** Postgres, direct: what migrations run against. Falls back to the pooled URL. */
  migrationDatabaseUrl: string
  /** SMTP URL the magic link is sent through. */
  emailUrl: string
  /** The From header on every message. */
  emailFrom: string
}

export type AccountsState = { enabled: false } | ({ enabled: true } & AccountsConfig)

export class AccountsConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid sign-in configuration:\n- ${problems.join('\n- ')}`)
    this.name = 'AccountsConfigError'
  }
}

const MIN_SECRET_LENGTH = 32

/**
 * Names a hosted Postgres may arrive under. DATABASE_URL is the documented
 * one; the rest are what the Vercel marketplace injects. First one wins.
 */
const DATABASE_URL_ALIASES = ['DATABASE_URL', 'POSTGRES_URL'] as const
const MIGRATION_URL_ALIASES = ['DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING'] as const

type Env = Record<string, string | undefined>

const first = (env: Env, names: readonly string[]) => names.map((name) => env[name]).find(Boolean)

function readUrl(raw: string | undefined, name: string, protocols: string[], problems: string[]): string {
  if (!raw) {
    problems.push(`${name} is not set`)
    return ''
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    problems.push(`${name} is not a URL. Expected ${protocols.join(' or ')}://…`)
    return ''
  }
  if (!protocols.includes(url.protocol.replace(/:$/, ''))) {
    problems.push(`${name} must start with ${protocols.map((p) => `${p}://`).join(' or ')}`)
    return ''
  }
  return raw
}

function readSecret(raw: string | undefined, problems: string[]): string {
  if (!raw) {
    problems.push('AUTH_SECRET is not set. Generate one with: openssl rand -base64 32')
    return ''
  }
  if (raw.length < MIN_SECRET_LENGTH) {
    problems.push(`AUTH_SECRET is shorter than ${MIN_SECRET_LENGTH} characters`)
    return ''
  }
  return raw
}

function readFrom(raw: string | undefined, problems: string[]): string {
  if (!raw) {
    problems.push('EMAIL_FROM is not set. Use an address, e.g. Wave <no-reply@wave.example.com>')
    return ''
  }
  if (!/@/.test(raw)) {
    problems.push('EMAIL_FROM must contain an email address')
    return ''
  }
  return raw
}

/** Reads the sign-in state from an arbitrary environment. Exported for tests. */
export function readAccountsConfig(env: Env): AccountsState {
  const secret = env.AUTH_SECRET
  const databaseUrl = first(env, DATABASE_URL_ALIASES)
  const emailUrl = env.EMAIL_URL
  const emailFrom = env.EMAIL_FROM
  if (!secret && !databaseUrl && !emailUrl && !emailFrom) return { enabled: false }

  const problems: string[] = []
  const config: AccountsConfig = {
    secret: readSecret(secret, problems),
    databaseUrl: readUrl(databaseUrl, 'DATABASE_URL', ['postgres', 'postgresql'], problems),
    migrationDatabaseUrl: '',
    emailUrl: readUrl(emailUrl, 'EMAIL_URL', ['smtp', 'smtps'], problems),
    emailFrom: readFrom(emailFrom, problems),
  }
  config.migrationDatabaseUrl = first(env, MIGRATION_URL_ALIASES) ?? config.databaseUrl
  if (problems.length > 0) throw new AccountsConfigError(problems)
  return { enabled: true, ...config }
}

let cached: AccountsState | undefined

/** The sign-in state, read once per process. Throws {@link AccountsConfigError} on a partial configuration. */
export function getAccountsConfig(): AccountsState {
  cached ??= readAccountsConfig(process.env)
  return cached
}

/** Test seam. */
export function resetAccountsConfigForTests(): void {
  cached = undefined
}
