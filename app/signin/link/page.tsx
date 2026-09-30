import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAccountsConfig } from '@/lib/accounts/config'
import { siteName } from '@/lib/site'
import { SignInFrame } from '../frame'
import { VerifyLink } from './verify-link'

export const metadata: Metadata = {
  title: `Signing in · ${siteName}`,
  robots: { index: false, follow: false },
}

/**
 * Where the emailed link lands. The token is in the fragment, which never
 * reaches this server; the browser reads it and hands it to a server action.
 */
export default function LinkPage() {
  if (!getAccountsConfig().enabled) notFound()
  return (
    <SignInFrame>
      <VerifyLink />
    </SignInFrame>
  )
}
