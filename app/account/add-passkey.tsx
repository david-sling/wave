'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { authClient } from '@/lib/accounts/client'

/** Registers a passkey on this device. The browser runs the ceremony; the page refreshes with it listed. */
export function AddPasskey() {
  const router = useRouter()
  const id = useId()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await authClient.passkey.addPasskey({ name: name.trim() || undefined })
    setBusy(false)
    if (result?.error) {
      setError('No passkey was added. The prompt may have been dismissed, or this browser cannot make one.')
      return
    }
    setName('')
    router.refresh()
  }

  return (
    <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-name`} className="text-[13px] font-semibold">
          Name <span className="font-normal text-ink-3">optional</span>
        </label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Work laptop"
          maxLength={40}
          autoComplete="off"
          className="input"
        />
      </div>
      <button type="submit" disabled={busy} className="btn btn-primary btn-sm h-11">
        {busy ? 'Waiting for the browser…' : 'Add a passkey'}
      </button>
      {error ? (
        <p role="alert" className="error-note m-0 text-sm sm:col-span-2">
          {error}
        </p>
      ) : null}
    </form>
  )
}
