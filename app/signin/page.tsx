import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getAccountSession } from '@/lib/accounts/auth'
import { getAccountsConfig } from '@/lib/accounts/config'
import { siteName } from '@/lib/site'
import { SignInFrame } from './frame'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = {
  title: `Sign in · ${siteName}`,
  robots: { index: false, follow: false },
}

/**
 * Sign in (ARCHITECTURE section 14, "Methods"). Passkeys first, through the
 * browser's own prompt on the email field; otherwise a link by email. On an
 * instance without sign-in this address does not exist.
 */
export default async function SignInPage() {
  if (!getAccountsConfig().enabled) notFound()
  if (await getAccountSession(await headers())) redirect('/account')
  return (
    <SignInFrame>
      <div className="grid gap-2">
        <h1 className="m-0 text-[clamp(1.75rem,3.2vw,2.25rem)] leading-[1.05] tracking-[-0.025em]">Sign in</h1>
        <p className="m-0 max-w-[40ch] text-[15px] text-ink-2">
          A passkey signs you in on its own. Without one, Wave sends a link to your email.
        </p>
      </div>
      <SignInForm />
    </SignInFrame>
  )
}
