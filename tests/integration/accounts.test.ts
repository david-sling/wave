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
const secret = 's'.repeat(32)

describe.skipIf(!databaseUrl)('sign-in', () => {
  const sent: { email: string; text: string }[] = []
  let pool: Pool
  let auth: import('@/lib/accounts/auth').Auth
  let redis: import('@/lib/redis').WaveRedis

  beforeAll(async () => {
    const { createAuth } = await import('@/lib/accounts/auth')
    const { migrateAccounts } = await import('@/lib/accounts/migrate')
    const config = {
      secret,
      databaseUrl: databaseUrl!,
      migrationDatabaseUrl: databaseUrl!,
      emailUrl: 'smtp://x',
      emailFrom: 'Wave <no-reply@wave.example.com>',
    }
    const { fakeRedis } = await import('./../fake-redis')
    redis = fakeRedis().redis
    pool = new Pool({ connectionString: databaseUrl })
    await pool.query('drop schema public cascade; create schema public;')
    await migrateAccounts(config, origin)
    auth = createAuth({
      config,
      origin,
      pool,
      redis: async () => redis,
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

  async function account(email: string) {
    const cookie = await signIn(email)
    const session = (await auth.api.getSession({ headers: new Headers({ cookie }) }))!
    return { cookie, user: session.user, session: session.session }
  }

  it('indexes owned channels, drops rows whose channel is gone, and disowns on delete', async () => {
    const { createChannel } = await import('@/lib/channels')
    const { countAccountChannels, disownChannels, listAccountChannels, rememberOwner } =
      await import('@/lib/accounts/channels')
    const { keys } = await import('@/lib/keys')
    const { user } = await account('owner@example.test')
    const a = await createChannel(redis, { ttl: '1h', mode: 'standard' }, { ownerId: user.id })
    const b = await createChannel(redis, { ttl: '1h', mode: 'standard' }, { ownerId: user.id })
    for (const c of [a, b]) {
      const expires = Math.floor(Date.parse(c.expires_at) / 1000)
      await rememberOwner(pool, secret, user.id, c.channel_id, expires, c.invite_token)
    }
    expect(await countAccountChannels(pool, user.id, 'owner')).toBe(2)
    await redis.del(keys.channel(b.channel_id))
    const listed = await listAccountChannels(pool, redis, user.id)
    expect(listed.map((o) => [o.channel.id, o.relation])).toEqual([[a.channel_id, 'owner']])
    expect(await countAccountChannels(pool, user.id)).toBe(1)
    await disownChannels(pool, redis, user.id)
    expect(await countAccountChannels(pool, user.id)).toBe(0)
    expect(await redis.hGetAll(keys.channel(a.channel_id))).not.toHaveProperty('owner_id')
  })

  it('opens a channel only for the account that holds it, and only while the invite still matches', async () => {
    const { createChannel } = await import('@/lib/channels')
    const { loadChannel } = await import('@/lib/auth')
    const { openAccountChannel, rememberMember } = await import('@/lib/accounts/channels')
    const { keys } = await import('@/lib/keys')
    const { hashToken, newToken } = await import('@/lib/tokens')
    const alice = await account('alice@example.test')
    const bob = await account('bob@example.test')
    const created = await createChannel(redis, { ttl: '1h', mode: 'standard' }, {})
    const channel = await loadChannel(redis, created.channel_id)
    await rememberMember(pool, secret, alice.user.id, channel, created.invite_token)

    const opened = await openAccountChannel(pool, redis, secret, alice.user.id, channel.id)
    expect(opened).toMatchObject({ invite: created.invite_token, relation: 'member', participantId: null })
    expect(await openAccountChannel(pool, redis, secret, bob.user.id, channel.id)).toBeNull()

    // Alice's sealed invite, copied into a row of Bob's, does not open.
    await pool.query(
      `insert into account_channel (account_id, channel_id, relation, invite_sealed, expires_at)
       select $2, channel_id, 'member', invite_sealed, expires_at from account_channel
       where account_id = $1 and channel_id = $3`,
      [alice.user.id, bob.user.id, channel.id],
    )
    expect(await openAccountChannel(pool, redis, secret, bob.user.id, channel.id)).toBeNull()

    // An invite that no longer matches the channel is not handed out.
    await redis.hSet(keys.channel(channel.id), { invite_hash: hashToken(newToken()) })
    expect(await openAccountChannel(pool, redis, secret, alice.user.id, channel.id)).toBeNull()
  })

  it("withdraws a session's device tokens when the session ends", async () => {
    const { createChannel } = await import('@/lib/channels')
    const { findParticipantByToken, loadChannel } = await import('@/lib/auth')
    const { joinChannel } = await import('@/lib/participants')
    const { issueDeviceToken } = await import('@/lib/devices')
    const { recordDevice } = await import('@/lib/accounts/channels')
    const carol = await account('carol@example.test')
    const other = await account('carol@example.test')
    const created = await createChannel(redis, { ttl: '1h', mode: 'standard' }, {})
    const channel = await loadChannel(redis, created.channel_id)
    const seat = await joinChannel(redis, channel, { name: 'Carol', role: 'human' })
    const device = await issueDeviceToken(redis, channel, seat.participant_id)
    await recordDevice(pool, redis, other.session.id, channel, device.tokenHash)
    expect((await findParticipantByToken(redis, channel.id, device.token))?.id).toBe(seat.participant_id)

    await auth.api.revokeSession({
      body: { token: other.session.token },
      headers: new Headers({ cookie: carol.cookie }),
    })
    expect(await findParticipantByToken(redis, channel.id, device.token)).toBeUndefined()
    // The seat's own token is untouched.
    expect((await findParticipantByToken(redis, channel.id, seat.participant_token))?.id).toBe(seat.participant_id)
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
