import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/react'
import { AUTH_BASE_PATH } from './paths.ts'

/**
 * The browser side of sign-in: passkeys need WebAuthn, which only the browser
 * has. Everything else goes through server actions, so this client is used
 * for exactly two calls: signing in with a passkey and adding one.
 */
export const authClient = createAuthClient({ basePath: AUTH_BASE_PATH, plugins: [passkeyClient()] })
