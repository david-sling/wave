import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { Footer } from '@/app/components/footer'
import { Nav } from '@/app/components/nav'
import { getAccountSession, getAuth } from '@/lib/accounts/auth'
import { listOwnedChannels } from '@/lib/accounts/owned'
import { getPool } from '@/lib/accounts/store'
import { getRedis } from '@/lib/redis'
import { siteName } from '@/lib/site'
import { toIso } from '@/lib/time'
import { deleteAccount, removePasskey, revokeSession, signOut } from './actions'
import { AddPasskey } from './add-passkey'
import { OwnedChannel } from './owned-channel'

export const metadata: Metadata = {
  title: `Account · ${siteName}`,
  robots: { index: false, follow: false },
}

const when = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

const methodLabel: Record<string, string> = {
  passkey: 'Passkey',
  'magic-link': 'Email link',
  device: 'Wave CLI',
  oauth: 'Sign-in provider',
}

/**
 * The account page (ARCHITECTURE section 14): what sign-in holds for a person
 * and nothing more. Passkeys, sessions, and the way out. Channels this account
 * owns join it with ownership.
 */
export default async function AccountPage() {
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

  return (
    <>
      <Nav atHome={false} />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 pt-14 md:pt-20">
          <div className="mx-auto grid w-full max-w-[640px] gap-8">
            <div className="grid gap-2">
              <h1 className="m-0 text-[clamp(1.75rem,3.2vw,2.25rem)] leading-[1.05] tracking-[-0.025em]">
                Your account
              </h1>
              <p className="m-0 text-[15px] text-ink-2">
                Signed in as <b className="font-semibold text-ink">{current.user.email}</b>.
              </p>
            </div>

            <section className="panel grid gap-4 p-5 md:p-6" aria-labelledby="channels">
              <div className="grid gap-1">
                <h2 id="channels" className="m-0 font-sans text-[16px] font-semibold">
                  Your channels
                </h2>
                <p className="m-0 text-[14px] text-ink-2">
                  {owned.length === 0
                    ? 'Channels you create while signed in are listed here until they expire.'
                    : 'Live channels you created while signed in. Taking control here lets this browser close one.'}
                </p>
              </div>
              {owned.length > 0 ? (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {owned.map(({ channel, createdAt }) => (
                    <OwnedChannel
                      key={channel.id}
                      id={channel.id}
                      name={channel.name}
                      createdAt={when.format(createdAt)}
                      expiresAt={when.format(new Date(toIso(channel.expires_at)))}
                    />
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="panel grid gap-4 p-5 md:p-6" aria-labelledby="passkeys">
              <div className="grid gap-1">
                <h2 id="passkeys" className="m-0 font-sans text-[16px] font-semibold">
                  Passkeys
                </h2>
                <p className="m-0 text-[14px] text-ink-2">
                  {passkeys.length === 0
                    ? 'None yet. With one, this device signs you in without an email.'
                    : 'Each signs you in on the device that holds it.'}
                </p>
              </div>
              {passkeys.length > 0 ? (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {passkeys.map((passkey) => (
                    <li
                      key={passkey.id}
                      className="flex items-center justify-between gap-4 rounded-[12px] border border-line-2 bg-panel-2 px-3.5 py-2.5"
                    >
                      <div className="min-w-0 text-[14px]">
                        <div className="truncate font-medium">{passkey.name || 'Passkey'}</div>
                        <div className="text-[13px] text-ink-3">Added {when.format(passkey.createdAt)}</div>
                      </div>
                      <form action={removePasskey.bind(null, passkey.id)}>
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : null}
              <AddPasskey />
            </section>

            <section className="panel grid gap-4 p-5 md:p-6" aria-labelledby="sessions">
              <div className="grid gap-1">
                <h2 id="sessions" className="m-0 font-sans text-[16px] font-semibold">
                  Where you are signed in
                </h2>
                <p className="m-0 text-[14px] text-ink-2">Signing out of one ends it at once, wherever it is.</p>
              </div>
              <ul className="m-0 grid list-none gap-2 p-0">
                {sessions.map((session) => {
                  const here = session.token === current.session.token
                  const method = (session as { method?: string | null }).method ?? 'unknown'
                  return (
                    <li
                      key={session.id}
                      className="flex items-center justify-between gap-4 rounded-[12px] border border-line-2 bg-panel-2 px-3.5 py-2.5"
                    >
                      <div className="min-w-0 text-[14px]">
                        <div className="font-medium">
                          {methodLabel[method] ?? 'Session'}
                          {here ? (
                            <span className="ml-2 text-[12.5px] font-semibold text-sky-ink">This device</span>
                          ) : null}
                        </div>
                        <div className="text-[13px] text-ink-3">
                          Signed in {when.format(session.createdAt)} · last used {when.format(session.updatedAt)}
                        </div>
                      </div>
                      {here ? (
                        <form action={signOut}>
                          <button type="submit" className="btn btn-secondary btn-sm">
                            Sign out
                          </button>
                        </form>
                      ) : (
                        <form action={revokeSession.bind(null, session.token)}>
                          <button type="submit" className="btn btn-secondary btn-sm">
                            End
                          </button>
                        </form>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
            <section className="grid gap-3 px-1" aria-labelledby="delete">
              <h2 id="delete" className="m-0 font-sans text-[16px] font-semibold">
                Delete this account
              </h2>
              <p className="m-0 max-w-[60ch] text-[14px] text-ink-2">
                Removes the account, its passkeys, and every session at once. Channels you created keep running on their
                admin tokens; they just no longer have an owner.
              </p>
              <form action={deleteAccount}>
                <button type="submit" className="btn btn-secondary btn-sm">
                  Delete account
                </button>
              </form>
            </section>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
