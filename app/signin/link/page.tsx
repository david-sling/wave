import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
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
export default async function LinkPage() {
  // Read per request, never at build: a build that sees half the sign-in
  // variables must still succeed, and only sign-in fails (AUTH.md 3.11).
  await connection()
  if (!getAccountsConfig().enabled) notFound()
  return (
    <SignInFrame>
      <VerifyLink />
    </SignInFrame>
  )
}
