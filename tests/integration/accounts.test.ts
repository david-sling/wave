import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Sign-in against a real Postgres (ARCHITECTURE section 14). Skipped unless
 * ACCOUNTS_TEST_DATABASE_URL is set; locally:
 *
 *   docker run -d --name wave-spike-pg -e POSTGRES_PASSWORD=spike -e POSTGRES_DB=wave_spike -p 5433:5432 postgres:17-alpine
 *   ACCOUNTS_TEST_DATABASE_URL=postgres://postgres:spike@localhost:5433/wave_spike npm run test:integration
 *
 * The suite owns the database it is given: it drops and recreates the public
 * schema, so never point it at anything but a throwaway.
 */

const databaseUrl = process.env.ACCOUNTS_TEST_DATABASE_URL
const origin = 'https://wave.example.com'

describe.skipIf(!databaseUrl)('sign-in', () => {
  const sent: { email: string; text: string }[] = []
  let pool: Pool
  let auth: import('@/lib/accounts/auth').Auth

  beforeAll(async () => {
    const { createAuth } = await import('@/lib/accounts/auth')
    const { migrateAccounts } = await import('@/lib/accounts/migrate')
    const config = {
      secret: 's'.repeat(32),
      databaseUrl: databaseUrl!,
      migrationDatabaseUrl: databaseUrl!,
      emailUrl: 'smtp://x',
      emailFrom: 'Wave <no-reply@wave.example.com>',
    }
    pool = new Pool({ connectionString: databaseUrl })
    await pool.query('drop schema public cascade; create schema public;')
    await migrateAccounts(config, origin)
    auth = createAuth({
      config,
      origin,
      pool,
      mailer: { send: async (email, _subject, text) => void sent.push({ email, text }) },
    })
  }, 60_000)

  afterAll(async () => {
    await pool?.end()
  })

  async function signIn(email: string): Promise<string> {
    await auth.api.signInMagicLink({ body: { email, callbackURL: '/' }, headers: new Headers() })
    const link = sent.at(-1)!.text.match(/#(\S+)/)![1]
    const { headers } = await auth.api.magicLinkVerify({
      query: { token: link },
      headers: new Headers(),
      returnHeaders: true,
    })
    return headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
  }

  it('sends the link with the token in the fragment and signs in from it in-process', async () => {
    const cookie = await signIn('one@example.test')
    expect(sent.at(-1)!.text).toContain(`${origin}/signin/link#`)
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(session?.user.email).toBe('one@example.test')
    expect(session?.user.emailVerified).toBe(true)
  })

  it('records provenance and no address on the session', async () => {
    const { rows } = await pool.query(`select method, issuer, "ipAddress" from session`)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row).toEqual({ method: 'magic-link', issuer: null, ipAddress: '' })
  })

  it('refuses the HTTP form of link verification', async () => {
    await auth.api.signInMagicLink({ body: { email: 'two@example.test', callbackURL: '/' }, headers: new Headers() })
    const token = sent.at(-1)!.text.match(/#(\S+)/)![1]
    const response = await auth.handler(new Request(`${origin}/api/auth/magic-link/verify?token=${token}`))
    expect(response.status).toBe(404)
  })

  it('revokes a session immediately', async () => {
    const a = await signIn('three@example.test')
    const b = await signIn('three@example.test')
    const raw = decodeURIComponent(b.match(/wave\.session_token=([^;]+)/)![1]).split('.')[0]
    await auth.api.revokeSession({ body: { token: raw }, headers: new Headers({ cookie: a }) })
    expect(await auth.api.getSession({ headers: new Headers({ cookie: b }) })).toBeNull()
  })
})

describe('with sign-in off', () => {
  it('the auth route is a 404 in the error envelope and getAccountSession is null', async () => {
    const { resetAccountsConfigForTests } = await import('@/lib/accounts/config')
    for (const name of ['AUTH_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'EMAIL_URL', 'EMAIL_FROM'])
      delete process.env[name]
    resetAccountsConfigForTests()
    const { getAccountSession } = await import('@/lib/accounts/auth')
    const { GET } = await import('@/app/api/auth/[...all]/route')
    expect(await getAccountSession(new Headers({ cookie: 'wave.session_token=x.y' }))).toBeNull()
    const response = await GET(
      new Request(`${origin}/api/auth/get-session`, { headers: { cookie: 'wave.session_token=x.y' } }),
    )
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('not_found')
  })
})
