import { passkey } from '@better-auth/passkey'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { bearer } from 'better-auth/plugins/bearer'
import { deviceAuthorization } from 'better-auth/plugins/device-authorization'
import { magicLink } from 'better-auth/plugins/magic-link'
import { Pool } from 'pg'
import { getConfig } from '../config.ts'
import { getAccountsConfig, type AccountsConfig } from './config.ts'
import { magicLinkMessage, smtpMailer, type Mailer } from './email.ts'

/**
 * Sign-in, built on Better Auth (ARCHITECTURE section 14). This is the only
 * module that imports the library. Everything the constraints in AUTH.md ask
 * for that the library does not do on its own is configured or enforced here.
 */

import { AUTH_BASE_PATH } from './paths.ts'

export { AUTH_BASE_PATH }
export const CLI_CLIENT_ID = 'wave-cli'

/** Session provenance (AUTH.md 5.3), from the endpoint that created the session. */
export function provenance(path: string | undefined): { method: string; issuer: string | null } {
  if (!path) return { method: 'unknown', issuer: null }
  if (path.startsWith('/magic-link/')) return { method: 'magic-link', issuer: null }
  if (path.startsWith('/passkey/')) return { method: 'passkey', issuer: null }
  if (path.startsWith('/device/')) return { method: 'device', issuer: null }
  const social = path.match(/^\/callback\/([^/]+)/)
  if (social) return { method: 'oauth', issuer: social[1] }
  return { method: 'unknown', issuer: null }
}

export type CreateAuthOptions = {
  config: AccountsConfig
  /** The public origin: cookies, the relying party, and the link in the email. */
  origin: string
  mailer?: Mailer
  /** A product built on Wave adds its own here; core's stay. */
  plugins?: NonNullable<BetterAuthOptions['plugins']>
  /** The store, when a caller already has one. */
  pool?: Pool
}

export function createAuth({ config, origin, mailer = smtpMailer(config), plugins = [], pool }: CreateAuthOptions) {
  const rpID = new URL(origin).hostname
  return betterAuth({
    secret: config.secret,
    baseURL: origin,
    basePath: AUTH_BASE_PATH,
    database: pool ?? new Pool({ connectionString: config.databaseUrl }),
    trustedOrigins: [origin],
    emailAndPassword: { enabled: false },
    advanced: {
      cookiePrefix: 'wave',
      useSecureCookies: origin.startsWith('https:'),
      // No address on a session (PRODUCT section 15.1).
      ipAddress: { disableIpTracking: true },
    },
    account: {
      // A provider sign-in whose email matches an account is refused, never
      // linked; linking is something a signed-in person does (AUTH.md 5.5).
      accountLinking: { enabled: true, disableImplicitLinking: true, trustedProviders: [] },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        method: { type: 'string', required: false, input: false },
        issuer: { type: 'string', required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => ({ data: { ...session, ...provenance(context?.path) } }),
        },
      },
    },
    hooks: {
      // The library verifies a magic link by GET with the token as a query,
      // which over HTTP puts a secret in a logged URL (AUTH.md 3.2). The
      // in-process call from the sign-in page carries no Request and is the
      // only way in; the HTTP form is answered as if the route did not exist.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/magic-link/verify' && ctx.request) {
          throw new APIError('NOT_FOUND', { message: 'Not found.' })
        }
      }),
    },
    plugins: [
      magicLink({
        expiresIn: 300,
        storeToken: 'hashed',
        // The token rides in the fragment, which browsers never send.
        sendMagicLink: async ({ email, token }) => {
          const { subject, text } = magicLinkMessage(origin, `${origin}/signin/link#${token}`)
          await mailer.send(email, subject, text)
        },
      }),
      passkey({
        rpID,
        rpName: 'Wave',
        origin,
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      }),
      deviceAuthorization({
        expiresIn: '10m',
        interval: '5s',
        userCodeLength: 8,
        validateClient: async (clientId) => clientId === CLI_CLIENT_ID,
      }),
      // Only so the CLI can present the session the device flow handed it.
      // Applies where the library is mounted; /api/v1/* never sees it.
      bearer(),
      nextCookies(),
      ...plugins,
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

let instance: Auth | undefined

/** The instance's sign-in, or undefined when sign-in is off. Built once per process. */
export function getAuth(): Auth | undefined {
  const state = getAccountsConfig()
  if (!state.enabled) return undefined
  instance ??= createAuth({ config: state, origin: getConfig().host })
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
