'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { authClient } from '@/lib/accounts/client'
import { requestLink, type LinkState } from '@/app/account/actions'

const initialState: LinkState = {}

/**
 * One field. On load the browser is asked for a passkey through conditional
 * UI, so a person with one sees it offered on the field and never types;
 * submitting the address asks for a link instead.
 */
export function SignInForm() {
  const [state, formAction, pending] = useActionState(requestLink, initialState)
  const router = useRouter()
  const id = useId()
  const asked = useRef(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  // The button, for browsers that do not offer the passkey on the field.
  const usePasskey = async () => {
    setPasskeyError(null)
    const result = await authClient.signIn.passkey()
    if (result?.data) router.replace('/account')
    else
      setPasskeyError('No passkey was used. The prompt may have been dismissed, or this browser holds none for Wave.')
  }

  useEffect(() => {
    if (asked.current) return
    asked.current = true
    let cancelled = false
    void authClient.signIn.passkey({ autoFill: true }).then((result) => {
      if (!cancelled && result?.data) router.replace('/account')
    })
    return () => {
      cancelled = true
    }
  }, [router])

  if (state.sent) {
    return (
      <div className="grid gap-3" role="status" aria-live="polite">
        <p className="m-0 text-[15px] font-semibold">Check your email</p>
        <p className="m-0 text-[15px] text-ink-2">
          A link is on its way to <b className="font-semibold text-ink">{state.sent}</b>. It works once and expires in
          five minutes.
        </p>
        <form action={formAction}>
          <input type="hidden" name="email" value={state.sent} />
          <button
            type="submit"
            disabled={pending}
            className="link cursor-pointer border-0 bg-transparent p-0 text-[14px]"
          >
            Send it again
          </button>
        </form>
      </div>
    )
  }

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-email`} className="text-[13px] font-semibold">
          Email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username webauthn"
          autoFocus
          required
          placeholder="you@example.com"
          className="input"
        />
      </div>
      {state.error ? (
        <p role="alert" className="error-note m-0 text-sm">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Sending…' : 'Send a link'}
      </button>
      <button type="button" onClick={usePasskey} className="btn btn-secondary">
        Use a passkey
      </button>
      {passkeyError ? (
        <p role="alert" className="error-note m-0 text-sm">
          {passkeyError}
        </p>
      ) : null}
    </form>
  )
}
