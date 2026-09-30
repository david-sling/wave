import { passkey } from '@better-auth/passkey'
import type { BetterAuthOptions } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { bearer } from 'better-auth/plugins/bearer'
import { deviceAuthorization } from 'better-auth/plugins/device-authorization'
import { magicLink } from 'better-auth/plugins/magic-link'
import { LIMITS } from '../limits.ts'
import type { AccountsConfig } from './config.ts'
import { magicLinkMessage, type Mailer } from './email.ts'
import { AUTH_BASE_PATH } from './paths.ts'

/**
 * The part of the library's configuration that needs no running instance:
 * methods, plugins, cookies, session shape, provenance. Migrations read it
 * without Redis or a request in sight (scripts/accounts-migrate.ts); the
 * live instance in auth.ts adds the store and the hooks that need one.
 */

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

export type BaseOptions = {
  config: AccountsConfig
  /** The public origin: cookies, the relying party, and the link in the email. */
  origin: string
  mailer: Mailer
}

export function baseAuthOptions({ config, origin, mailer }: BaseOptions) {
  const rpID = new URL(origin).hostname
  const signInRule = { window: 60, max: LIMITS.signInRequestsPerMinute }
  return {
    secret: config.secret,
    baseURL: origin,
    basePath: AUTH_BASE_PATH,
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
    user: {
      deleteUser: { enabled: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        method: { type: 'string', required: false, input: false },
        issuer: { type: 'string', required: false, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      customRules: {
        '/sign-in/magic-link': signInRule,
        '/sign-in/passkey': signInRule,
        '/passkey/generate-authenticate-options': signInRule,
        '/device/code': signInRule,
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
    ],
  } satisfies BetterAuthOptions
}
