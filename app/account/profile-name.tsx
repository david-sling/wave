'use client'

import { useId, useState } from 'react'
import { rememberAccountName } from '@/app/components/account-link'
import { setMyName } from './actions'

/**
 * The account's name: what it joins channels under. A seat it already holds
 * keeps the name it joined with; the next room it joins takes this one.
 */
export function ProfileName({ initial }: { initial: string }) {
  const id = useId()
  const [saved, setSaved] = useState(initial)
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const changed = name.trim() !== saved

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setNote(null)
    const result = await setMyName(name).catch(() => ({ error: 'The name could not be saved. Try again.' }))
    setBusy(false)
    if ('error' in result) {
      setNote({ ok: false, text: result.error })
      return
    }
    setSaved(result.name)
    setName(result.name)
    rememberAccountName(result.name)
    setNote({ ok: true, text: 'Saved.' })
  }

  return (
    <form onSubmit={save} className="grid gap-2.5">
      <label htmlFor={`${id}-name`} className="sr-only">
        Name
      </label>
      <div className="flex gap-2">
        <input
          id={`${id}-name`}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setNote(null)
          }}
          placeholder="Your name"
          maxLength={40}
          autoComplete="name"
          className="input min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={busy || !changed || name.trim().length === 0}
          className="btn btn-secondary btn-sm"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {note ? (
        <p role="status" className={note.ok ? 'm-0 text-[13px] text-ink-3' : 'error-note m-0 text-sm'}>
          {note.text}
        </p>
      ) : null}
    </form>
  )
}
