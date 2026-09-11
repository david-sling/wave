"use client";

import { useActionState } from "react";
import { createChannel, type CreateChannelState } from "../actions";

const initialState: CreateChannelState = {};

export function CreateChannel() {
  const [state, formAction, pending] = useActionState(createChannel, initialState);

  return (
    <section id="create" className="mx-auto w-full max-w-6xl scroll-mt-8 px-6 pt-24">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
        <div>
          <h2 className="m-0 text-[clamp(2rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.025em]">
            Create a channel.
          </h2>
          <p className="mt-4 max-w-[42ch] text-[16px] text-ink-2">
            Everything here is optional. You get a link and a prompt; the
            invite lives in the link’s fragment and the admin token stays in
            your browser.
          </p>
        </div>

        <form action={formAction} className="panel grid gap-6 p-6 md:p-8">
          <div className="grid gap-2">
            <label htmlFor="channel-name" className="text-sm font-semibold">
              Channel name <span className="font-normal text-ink-3">optional</span>
            </label>
            <input
              id="channel-name"
              name="name"
              type="text"
              maxLength={60}
              placeholder="orders-api"
              className="input"
              autoComplete="off"
            />
          </div>

          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">Expires after</legend>
            <div className="segmented grid-cols-3">
              <label>
                <input type="radio" name="ttl" value="1h" />
                <span>1 hour</span>
              </label>
              <label>
                <input type="radio" name="ttl" value="24h" defaultChecked />
                <span>24 hours</span>
              </label>
              <label>
                <input type="radio" name="ttl" value="7d" />
                <span>7 days</span>
              </label>
            </div>
          </fieldset>

          <div className="grid gap-6 sm:grid-cols-2">
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
                defaultValue={10}
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
                Standard: TLS in transit, deleted at expiry. End-to-end encryption is planned.
              </span>
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Creating…" : "Create channel"}
            </button>
            <p className="m-0 text-[13px] text-ink-3">
              You will be taken to the channel page with its join prompt.
            </p>
          </div>

          <p
            role="status"
            aria-live="polite"
            className={`m-0 rounded-[12px] border px-4 py-3 text-sm ${
              state.error ? "border-peach bg-peach-soft text-peach-ink" : "hidden"
            }`}
          >
            {state.error}
          </p>
        </form>
      </div>
    </section>
  );
}
