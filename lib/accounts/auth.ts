import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { Pool } from 'pg'
import { getConfig } from '../config.ts'
import { consumeLimit } from '../rate-limit.ts'
import { getRedis, type WaveRedis } from '../redis.ts'
import { getAccountsConfig, type AccountsConfig } from './config.ts'
import { smtpMailer, type Mailer } from './email.ts'
import { baseAuthOptions, provenance } from './options.ts'
import { disownChannels } from './owned.ts'
import { getPool } from './store.ts'

/**
 * Sign-in, built on Better Auth (ARCHITECTURE section 14). The configuration
 * is in options.ts; this file binds it to the store and to Redis and is the
 * only thing that builds a live instance. Everything the constraints in
 * AUTH.md ask for that the library does not do on its own is enforced in
 * one of the two.
 */

export { CLI_CLIENT_ID, provenance } from './options.ts'
export { AUTH_BASE_PATH } from './paths.ts'

export type CreateAuthOptions = {
  config: AccountsConfig
  /** The public origin: cookies, the relying party, and the link in the email. */
  origin: string
  mailer?: Mailer
  /** A product built on Wave adds its own here; core's stay. */
  plugins?: NonNullable<BetterAuthOptions['plugins']>
  /** The store, when a caller already has one. */
  pool?: Pool
  /** Where the counters live. Defaults to the instance's Redis. */
  redis?: () => Promise<WaveRedis>
}

export function createAuth({
  config,
  origin,
  mailer = smtpMailer(config),
  plugins = [],
  pool,
  redis = getRedis,
}: CreateAuthOptions) {
  const store = pool ?? new Pool({ connectionString: config.databaseUrl })
  const base = baseAuthOptions({ config, origin, mailer })
  return betterAuth({
    ...base,
    database: store,
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => ({ data: { ...session, ...provenance(context?.path) } }),
        },
      },
      user: {
        delete: {
          // The channels keep running on their admin tokens (AUTH.md 4.4).
          before: async (user) => {
            await disownChannels(store, await redis(), user.id)
          },
        },
      },
    },
    rateLimit: {
      ...base.rateLimit,
      // The library's own limiter, counting in the instance's Redis with the
      // same salted-hash counters as every other limit (lib/rate-limit.ts).
      customStorage: {
        consume: async (key, rule) => {
          const { allowed, retryAfter } = await consumeLimit(await redis(), {
            scope: 'auth',
            subject: key,
            max: rule.max,
            windowSeconds: rule.window,
          })
          return { allowed, retryAfter: allowed ? null : retryAfter }
        },
      },
    },
    plugins: [...base.plugins, ...plugins],
  })
}

export type Auth = ReturnType<typeof createAuth>

let instance: Auth | undefined

/** The instance's sign-in, or undefined when sign-in is off. Built once per process. */
export function getAuth(): Auth | undefined {
  const state = getAccountsConfig()
  if (!state.enabled) return undefined
  instance ??= createAuth({ config: state, origin: getConfig().host, pool: getPool() })
  return instance
}

export type AccountSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>

/**
 * The signed-in person behind a request, or null. Reads the cookie the
 * browser sends, or the bearer the CLI sends under /api/auth. With sign-in
 * off it touches nothing and answers null, so a cookie presented to an
 * instance without sign-in is indistinguishable from none (AUTH.md 3.10).
 */
export async function getAccountSession(headers: Headers): Promise<AccountSession | null> {
  const auth = getAuth()
  if (!auth) return null
  return auth.api.getSession({ headers })
}

/** Test seam. */
export function resetAuthForTests(): void {
  instance = undefined
}
