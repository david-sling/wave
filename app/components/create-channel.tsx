"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { createChannel, type CreateChannelState } from "../actions";
import { CloseIcon } from "./icons";

const initialState: CreateChannelState = {};

/** Where the creator's admin token lives, per ARCHITECTURE section 6. */
export const adminTokenKey = (channelId: string) => `wave.admin.${channelId}`;

const ttlOptions = [
  { value: "1h", label: "1 hour", summary: "1 hour" },
  { value: "24h", label: "24 hours", summary: "24 hours" },
  { value: "7d", label: "7 days", summary: "7 days" },
];

/**
 * The main call to action: a channel name and a button.
 *
 * Naming a channel is the only decision worth making before the room exists,
 * so it is the one control in the hero. Expiry, size, and mode all have
 * answers that are right most of the time; they live behind "Options" and
 * stay in the same form, so the settings submit with the name.
 */
export function CreateChannelForm() {
  const [state, formAction, pending] = useActionState(createChannel, initialState);
  const router = useRouter();
  const [options, setOptions] = useState(false);
  const [ttl, setTtl] = useState("24h");
  const [maxParticipants, setMaxParticipants] = useState("10");
  const dialog = useRef<HTMLDialogElement>(null);
  const name = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const created = state.created;
    if (!created) return;

    // The admin token is the creator's alone: it stays in this browser and is
    // sent only when they close the channel.
    try {
      window.localStorage.setItem(adminTokenKey(created.channelId), created.adminToken);
    } catch {
      // Private browsing, or storage switched off. The channel still works;
      // only the close button on this device is lost.
    }
    // The invite rides in the fragment, so it never reaches the server. replace
    // rather than push: going back should not land on a filled-in form that
    // creates a second channel.
    router.replace(`/c/${created.channelId}#${created.invite}`);
  }, [state.created, router]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (options && !element.open) element.showModal();
    if (!options && element.open) element.close();
  }, [options]);

  // Anyone arriving at /#create asked for this form, from the nav or from a
  // closed channel. Put the caret where they were going.
  useEffect(() => {
    const focusOnHash = () => {
      if (window.location.hash === "#create") name.current?.focus();
    };
    focusOnHash();
    window.addEventListener("hashchange", focusOnHash);
    return () => window.removeEventListener("hashchange", focusOnHash);
  }, []);

  const busy = pending || Boolean(state.created);
  const ttlSummary = ttlOptions.find((option) => option.value === ttl)?.summary ?? "24 hours";

  return (
    <form action={formAction} id="create" className="grid scroll-mt-8 gap-3">
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
          placeholder="Name your channel, e.g. orders-api"
          className="input h-12 sm:max-w-[22rem]"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary shrink-0" disabled={busy}>
          {busy ? "Creating…" : "Create a channel"}
        </button>
      </div>

      <p className="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-3">
        <span>Free, no account. The name is optional.</span>
        <span aria-hidden className="hidden sm:inline">·</span>
        <button
          type="button"
          onClick={() => setOptions(true)}
          aria-haspopup="dialog"
          className="cursor-pointer rounded-[6px] border-0 bg-transparent p-0 font-[inherit] text-[13px] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
        >
          {`Expires in ${ttlSummary}, up to ${maxParticipants || "10"} in the room`}
        </button>
      </p>

      {/* The dialog stays inside the form, so what is chosen here is submitted
          with the name. A native dialog carries focus, Escape, and backdrop. */}
      <dialog
        ref={dialog}
        onClose={() => setOptions(false)}
        onClick={(event) => {
          if (event.target === dialog.current) setOptions(false);
        }}
        onKeyDown={(event) => {
          // Enter in a settings field means "done here", not "create now".
          if (event.key === "Enter") {
            event.preventDefault();
            setOptions(false);
          }
        }}
        className="dialog-modal m-auto w-[min(92vw,480px)] rounded-[20px] border border-line bg-panel p-0 text-left text-ink"
        aria-labelledby="channel-options-heading"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 id="channel-options-heading" className="m-0 font-sans text-[15px] font-semibold">
            Channel options
          </h2>
          <button
            type="button"
            onClick={() => setOptions(false)}
            aria-label="Close"
            className="grid size-8 cursor-pointer place-items-center rounded-[9px] border-0 bg-transparent text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="grid gap-6 px-5 py-5">
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">Expires after</legend>
            <div className="segmented grid-cols-3">
              {ttlOptions.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="ttl"
                    value={option.value}
                    checked={ttl === option.value}
                    onChange={() => setTtl(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <label htmlFor="max-participants" className="text-sm font-semibold">
              Participants
            </label>
            <input
              id="max-participants"
              name="max_participants"
              type="number"
              min={2}
              max={50}
              value={maxParticipants}
              onChange={(event) => setMaxParticipants(event.target.value)}
              inputMode="numeric"
              className="input"
            />
            <span className="text-[13px] text-ink-3">Agents and humans together, up to 50.</span>
          </div>

          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">Mode</legend>
            <div className="segmented grid-cols-2">
              <label>
                <input type="radio" name="mode" value="standard" defaultChecked />
                <span>Standard</span>
              </label>
              <label title="Coming later">
                <input type="radio" name="mode" value="e2ee" disabled />
                <span>Encrypted</span>
              </label>
            </div>
            <span className="text-[13px] text-ink-3">
              Standard: TLS in transit, deleted when the channel expires or is closed. End-to-end
              encryption is planned.
            </span>
          </fieldset>
        </div>

        <div className="flex justify-end border-t border-line px-5 py-4">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setOptions(false)}>
            Done
          </button>
        </div>
      </dialog>

      <p
        role="status"
        aria-live="polite"
        className={`error-note m-0 max-w-[42ch] text-sm ${state.error ? "" : "hidden"}`}
      >
        {state.error}
      </p>
    </form>
  );
}
