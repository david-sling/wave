'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useActionState, useEffect, useId, useRef, useState } from 'react'
import { createChannel, type CreateChannelState } from '../actions'
import { CloseIcon } from './icons'

const initialState: CreateChannelState = {}

/** Where the creator's admin token lives, per ARCHITECTURE section 6. */
export const adminTokenKey = (channelId: string) => `wave.admin.${channelId}`

const ttlOptions = [
  { value: '1h', label: '1h', summary: '1 hour' },
  { value: '24h', label: '24h', summary: '24 hours' },
  { value: '7d', label: '7d', summary: '7 days' },
]

type Draft = { name: string; ttl: string; maxParticipants: string }
const blankDraft: Draft = { name: '', ttl: '24h', maxParticipants: '10' }

/** Submits to the create action, then opens the new channel. */
function useCreateChannel() {
  const [state, formAction, pending] = useActionState(createChannel, initialState)
  const router = useRouter()

  useEffect(() => {
    const created = state.created
    if (!created) return

    // The admin token is the creator's alone: it stays in this browser and is
    // sent only when they close the channel.
    try {
      window.localStorage.setItem(adminTokenKey(created.channelId), created.adminToken)
    } catch {
      // Private browsing, or storage switched off. The channel still works;
      // only the close button on this device is lost.
    }
    // The invite rides in the fragment, so it never reaches the server. replace
    // rather than push: going back should not land on a filled-in form that
    // creates a second channel.
    router.replace(`/c/${created.channelId}#${created.invite}`)
  }, [state.created, router])

  // Submitted by hand rather than through `action`: React resets a form after
  // its action runs, which puts a controlled radio back to its first render
  // while state still holds the choice, so a retry after an error would send
  // the wrong expiry.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(() => formAction(data))
  }

  return { state, onSubmit, busy: pending || Boolean(state.created) }
}

function ErrorNote({ error }: { error?: string }) {
  return (
    <p role="status" aria-live="polite" className={`error-note m-0 max-w-[42ch] text-sm ${error ? '' : 'hidden'}`}>
      {error}
    </p>
  )
}

/**
 * Everything a channel is created with, and the button that creates it.
 *
 * One dialog for every way in: the hero's settings link opens it holding the
 * name already typed, and a New channel button on a page with no form opens it
 * blank. Either way it submits itself, so there is no Done and then Create.
 */
export function CreateChannelDialog({
  open,
  onClose,
  draft,
  onDraft,
}: {
  open: boolean
  onClose: () => void
  draft: Draft
  onDraft: (draft: Draft) => void
}) {
  const { state, onSubmit, busy } = useCreateChannel()
  const dialog = useRef<HTMLDialogElement>(null)
  const name = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      name.current?.focus()
    }
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
      className="dialog-modal dialog-adaptive m-auto w-[min(92vw,420px)] overflow-hidden rounded-[20px] border border-line bg-panel p-0 text-left text-ink max-sm:mx-0 max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]"
      aria-labelledby={`${id}-heading`}
    >
      <form onSubmit={onSubmit}>
        <div className="flex items-center justify-between gap-4 border-b border-line py-2.5 pl-4 pr-2.5">
          <h2 id={`${id}-heading`} className="m-0 font-sans text-[15px] font-semibold">
            Create a channel
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 cursor-pointer place-items-center rounded-[9px] border-0 bg-transparent text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-name`} className="text-[13px] font-semibold">
              Name <span className="font-normal text-ink-3">optional</span>
            </label>
            <input
              ref={name}
              id={`${id}-name`}
              name="name"
              type="text"
              maxLength={60}
              value={draft.name}
              onChange={(event) => onDraft({ ...draft, name: event.target.value })}
              placeholder="orders-api"
              className="input"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <div className="choices">
              <fieldset className="choice-group">
                <legend className="sr-only">Expires after</legend>
                {ttlOptions.map((option) => (
                  <label key={option.value} className="choice" title={`Expires after ${option.summary}`}>
                    <input
                      type="radio"
                      name="ttl"
                      value={option.value}
                      checked={draft.ttl === option.value}
                      onChange={() => onDraft({ ...draft, ttl: option.value })}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="choice-group">
                <legend className="sr-only">Mode</legend>
                <label className="choice">
                  <input type="radio" name="mode" value="standard" defaultChecked />
                  <span>Standard</span>
                </label>
                <label className="choice" title="Coming later">
                  <input type="radio" name="mode" value="e2ee" disabled />
                  <span>Encrypted</span>
                </label>
              </fieldset>

              <label className="flex items-center gap-2 text-[14px] font-medium text-ink-3">
                <span>up to</span>
                <input
                  name="max_participants"
                  type="number"
                  min={2}
                  max={50}
                  value={draft.maxParticipants}
                  onChange={(event) => onDraft({ ...draft, maxParticipants: event.target.value })}
                  inputMode="numeric"
                  aria-label="People in the room, from 2 to 50"
                  className="h-[2.125rem] w-14 rounded-full border border-line bg-panel px-3 text-center text-[14px] font-medium text-ink outline-none focus-visible:border-accent"
                />
                <span>people</span>
              </label>
            </div>
            <p className="m-0 text-[12.5px] text-ink-3">Deleted when it expires or is closed. Encryption is coming.</p>
          </div>

          <ErrorNote error={state.error} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 max-sm:justify-end">
          <span className="text-[13px] text-ink-3 max-sm:hidden">Free, no account.</span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create channel'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  )
}

/** A New channel button for a page that has no create form of its own. */
export function CreateChannelButton({ className, children }: { className: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(blankDraft)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {children}
      </button>
      <CreateChannelDialog open={open} onClose={() => setOpen(false)} draft={draft} onDraft={setDraft} />
    </>
  )
}

/**
 * The main call to action: a channel name and a button.
 *
 * Naming a channel is the only decision worth making before the room exists,
 * so it is the one control in the hero. Expiry, size, and mode have answers
 * that are right most of the time; they live in the dialog, which opens
 * holding the name and can create the channel itself.
 */
export function CreateChannelForm() {
  const { state, onSubmit, busy } = useCreateChannel()
  const [options, setOptions] = useState(false)
  const [draft, setDraft] = useState(blankDraft)
  const name = useRef<HTMLInputElement>(null)

  // Anyone arriving at /#create asked for this form, from the nav or from a
  // closed channel. Put the caret where they were going.
  useEffect(() => {
    const focusOnHash = () => {
      if (window.location.hash === '#create') name.current?.focus()
    }
    focusOnHash()
    window.addEventListener('hashchange', focusOnHash)
    return () => window.removeEventListener('hashchange', focusOnHash)
  }, [])

  const ttlSummary = ttlOptions.find((option) => option.value === draft.ttl)?.summary ?? '24 hours'

  return (
    <>
      <form onSubmit={onSubmit} id="create" className="grid scroll-mt-8 gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label htmlFor="channel-name" className="sr-only">
            Channel name
          </label>
          <input
            ref={name}
            id="channel-name"
            name="name"
            type="text"
            maxLength={60}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Name your channel, e.g. orders-api"
            className="input h-12 sm:max-w-[22rem]"
            autoComplete="off"
          />
          <input type="hidden" name="ttl" value={draft.ttl} />
          <input type="hidden" name="max_participants" value={draft.maxParticipants} />
          <input type="hidden" name="mode" value="standard" />
          <button type="submit" className="btn btn-primary shrink-0" disabled={busy}>
            {busy ? 'Creating…' : 'Create a channel'}
          </button>
        </div>

        <p className="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-3">
          <span>Free, no account. The name is optional.</span>
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <button
            type="button"
            onClick={() => setOptions(true)}
            aria-haspopup="dialog"
            className="cursor-pointer rounded-[6px] border-0 bg-transparent p-0 font-[inherit] text-[13px] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            {`Expires in ${ttlSummary}, up to ${draft.maxParticipants || '10'} in the room`}
          </button>
        </p>

        <ErrorNote error={state.error} />
      </form>

      {/* Outside the form: a form cannot hold another, and the dialog submits its own. */}
      <CreateChannelDialog open={options} onClose={() => setOptions(false)} draft={draft} onDraft={setDraft} />
    </>
  )
}
