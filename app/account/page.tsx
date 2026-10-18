import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Footer } from '@/app/components/footer'
import { Nav } from '@/app/components/nav'
import { getAccountSession, getAuth } from '@/lib/accounts/auth'
import { listOwnedChannels } from '@/lib/accounts/owned'
import { getPool } from '@/lib/accounts/store'
import { getRedis } from '@/lib/redis'
import { siteName } from '@/lib/site'
import { CreateChannelButton } from '@/app/components/create-channel'
import { deviceLabel } from '@/lib/accounts/device-label'
import { relativeTime, timeLeft } from '@/lib/relative-time'
import { toIso } from '@/lib/time'
import { removePasskey, revokeSession, signOut } from './actions'
import { AddPasskey } from './add-passkey'
import { DeleteAccount } from './delete-account'
import { OwnedChannel } from './owned-channel'

export const metadata: Metadata = {
  title: `Account · ${siteName}`,
  robots: { index: false, follow: false },
}

const day = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })

const methodLabel: Record<string, string> = {
  passkey: 'passkey',
  'magic-link': 'email link',
  device: 'Wave CLI',
  oauth: 'sign-in provider',
}

const row = 'flex items-center justify-between gap-3 py-3'
const sideHeading = 'm-0 font-sans text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3'

/**
 * The account page (ARCHITECTURE section 14). Channels are what a person
 * comes here for, so they take the page; passkeys, sessions, and the way out
 * are settings, kept in a narrower column beside them.
 */
export default async function AccountPage() {
  // Read per request, never at build: a build that sees half the sign-in
  // variables must still succeed, and only sign-in fails (AUTH.md 3.11).
  await connection()
  const auth = getAuth()
  if (!auth) notFound()
  const requestHeaders = await headers()
  const current = await getAccountSession(requestHeaders)
  if (!current) redirect('/signin')
  const [passkeys, sessions, owned] = await Promise.all([
    auth.api.listPasskeys({ headers: requestHeaders }),
    auth.api.listSessions({ headers: requestHeaders }),
    listOwnedChannels(getPool(), await getRedis(), current.user.id),
  ])
  const now = new Date()
  // This device first, then the most recently used.
  const ordered = [...sessions].sort(
    (a, b) =>
      Number(b.id === current.session.id) - Number(a.id === current.session.id) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  return (
    <>
      <Nav atHome={false} />
      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl gap-8 px-6 pb-20 pt-14 md:pt-20">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-1.5">
              <h1 className="m-0 text-[clamp(1.75rem,3.2vw,2.25rem)] leading-[1.05] tracking-[-0.025em]">
                Your account
              </h1>
              <p className="m-0 text-[15px] text-ink-2">{current.user.email}</p>
            </div>
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary btn-sm">
                Sign out
              </button>
            </form>
          </header>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="panel grid gap-1 p-5 md:p-6" aria-labelledby="channels">
              <div className="flex items-center justify-between gap-4 pb-2">
                <h2 id="channels" className="m-0 font-sans text-[18px] font-semibold">
                  Channels
                  {owned.length > 0 ? (
                    <span className="ml-2 text-[14px] font-medium text-ink-3">{owned.length}</span>
                  ) : null}
                </h2>
                {owned.length > 0 ? (
                  <CreateChannelButton className="btn btn-primary btn-sm">New channel</CreateChannelButton>
                ) : null}
              </div>
              {owned.length > 0 ? (
                <ul className="m-0 grid list-none divide-y divide-line-2 p-0">
                  {owned.map(({ channel, createdAt }) => (
                    <OwnedChannel
                      key={channel.id}
                      id={channel.id}
                      name={channel.name}
                      createdAt={relativeTime(createdAt.toISOString(), now)}
                      left={timeLeft(toIso(channel.expires_at), now)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="grid justify-items-center gap-3 rounded-[14px] border border-dashed border-line-strong px-6 py-12 text-center">
                  <p className="m-0 text-[15px] font-medium">No channels yet</p>
                  <p className="m-0 max-w-[42ch] text-[14px] text-ink-2">
                    Channels you create while signed in show up here until they expire.
                  </p>
                  <CreateChannelButton className="btn btn-primary btn-sm mt-1">Create a channel</CreateChannelButton>
                </div>
              )}
            </section>

            <aside className="grid gap-6" aria-label="Account settings">
              <section className="panel grid gap-1 p-5" aria-labelledby="passkeys">
                <h2 id="passkeys" className={sideHeading}>
                  Passkeys
                </h2>
                {passkeys.length > 0 ? (
                  <ul className="m-0 grid list-none divide-y divide-line-2 p-0">
                    {passkeys.map((passkey) => (
                      <li key={passkey.id} className={row}>
                        <div className="min-w-0 text-[14px]">
                          <div className="truncate font-medium">{passkey.name || 'Passkey'}</div>
                          <div className="text-[12.5px] text-ink-3">Added {day.format(passkey.createdAt)}</div>
                        </div>
                        <form action={removePasskey.bind(null, passkey.id)}>
                          <button type="submit" className="btn btn-secondary btn-sm">
                            Remove
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 py-2 text-[13.5px] text-ink-2">
                    Add one and this device signs you in without an email.
                  </p>
                )}
                <div className="pt-2">
                  <AddPasskey />
                </div>
              </section>

              <section className="panel grid gap-1 p-5" aria-labelledby="sessions">
                <h2 id="sessions" className={sideHeading}>
                  Signed in on
                </h2>
                <ul className="m-0 grid list-none divide-y divide-line-2 p-0">
                  {ordered.map((session) => {
                    const here = session.id === current.session.id
                    const method = (session as { method?: string | null }).method ?? 'unknown'
                    return (
                      <li key={session.id} className={row}>
                        <div className="min-w-0 text-[14px]">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="truncate">{deviceLabel(session.userAgent)}</span>
                            {here ? (
                              <span className="shrink-0 rounded-full bg-sky-soft px-2 py-0.5 text-[11.5px] font-semibold text-sky-ink">
                                This device
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[12.5px] text-ink-3">
                            {here
                              ? 'Active now'
                              : `Active ${relativeTime(new Date(session.updatedAt).toISOString(), now)}`}{' '}
                            · by {methodLabel[method] ?? 'sign-in'}
                          </div>
                        </div>
                        {here ? null : (
                          <form action={revokeSession.bind(null, session.id)}>
                            <button type="submit" className="btn btn-secondary btn-sm">
                              Sign out
                            </button>
                          </form>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>

              <section className="grid gap-3 px-1" aria-labelledby="delete">
                <h2 id="delete" className={sideHeading}>
                  Delete account
                </h2>
                <p className="m-0 text-[13.5px] text-ink-2">
                  Channels you created keep running on their admin tokens; they just lose their owner.
                </p>
                <DeleteAccount />
              </section>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
