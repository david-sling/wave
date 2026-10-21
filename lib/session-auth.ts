/**
 * How a signed-in page asks the channel API to use its session instead of a
 * token (lib/accounts/channel-access.ts). A custom header, so no other origin
 * can send it without a preflight this API never answers.
 */
export const SESSION_AUTH_HEADER = 'x-wave-auth'
export const SESSION_AUTH_VALUE = 'session'
export const sessionAuth: Record<string, string> = { [SESSION_AUTH_HEADER]: SESSION_AUTH_VALUE }
