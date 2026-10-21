import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { getAccountSession, getAuth } from '@/lib/accounts/auth'
import { siteName } from '@/lib/site'
import { SignOutForm } from '@/app/components/account-link'
import { ChevronLeftIcon } from '@/app/components/icons'
import { deviceLabel } from '@/lib/accounts/device-label'
import { relativeTime } from '@/lib/relative-time'
import { removePasskey, revokeSession } from './actions'
import { AddPasskey } from './add-passkey'
import { DeleteAccount } from './delete-account'
import { ProfileName } from './profile-name'

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
 * The account page (ARCHITECTURE section 14), in the same frame as a channel:
 * the channels pane stays on the left, and this page takes the place of the
 * room. The pane already lists the channels, so this page holds only what
 * sign-in keeps for a person: passkeys, sessions, and the way out.
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
  const [passkeys, sessions] = await Promise.all([
    auth.api.listPasskeys({ headers: requestHeaders }),
    auth.api.listSessions({ headers: requestHeaders }),
  ])
  const now = new Date()
  // This device first, then the most recently used.
  const ordered = [...sessions].sort(
    (a, b) =>
      Number(b.id === current.session.id) - Number(a.id === current.session.id) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ground">
      <header className="box-content flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/c"
            aria-label="All channels"
            className="-ml-2 grid size-9 shrink-0 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink lg:hidden"
          >
            <ChevronLeftIcon size={20} />
          </Link>
          <h1 className="m-0 truncate font-sans text-[15px] font-semibold">Account</h1>
        </div>
        <SignOutForm>
          <button type="submit" className="btn btn-secondary btn-sm">
            Sign out
          </button>
        </SignOutForm>
      </header>

      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[680px] gap-6 px-4 py-8 md:px-6 md:py-10">
          <p className="m-0 px-1 text-[14px] text-ink-2">
            Signed in as <b className="font-semibold text-ink">{current.user.email}</b>
          </p>

          <section className="panel grid gap-2 p-5" aria-labelledby="name">
            <h2 id="name" className={sideHeading}>
              Name
            </h2>
            <p className="m-0 text-[13.5px] text-ink-2">
              The name you join channels under, so you are not asked each time.
            </p>
            <ProfileName initial={current.user.name ?? ''} />
          </section>

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
                        {here ? 'Active now' : `Active ${relativeTime(new Date(session.updatedAt).toISOString(), now)}`}{' '}
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

          <section className="grid gap-3 px-1 pt-2" aria-labelledby="delete">
            <h2 id="delete" className={sideHeading}>
              Delete account
            </h2>
            <p className="m-0 text-[13.5px] text-ink-2">
              Channels you created keep running on their admin tokens; they just lose their owner.
            </p>
            <DeleteAccount />
          </section>
        </div>
      </div>
    </div>
  )
}
