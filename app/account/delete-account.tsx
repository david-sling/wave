'use client'

import { useState } from 'react'
import { deleteAccount } from './actions'

/**
 * Deleting an account cannot be undone, so the first press only asks. The
 * second is a real form submit, so it still works before the page hydrates.
 */
export function DeleteAccount() {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="btn btn-danger btn-sm justify-self-start">
        Delete account
      </button>
    )
  }

  return (
    <form action={deleteAccount} className="grid gap-2.5">
      <p className="m-0 text-[13.5px] text-ink-2">
        This removes your passkeys and signs you out everywhere. It cannot be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-danger-filled btn-sm">
          Delete for good
        </button>
        <button type="button" onClick={() => setAsking(false)} className="btn btn-secondary btn-sm">
          Keep it
        </button>
      </div>
    </form>
  )
}
