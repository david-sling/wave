"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Logo } from "../logo";
import { identityPalette } from "@/lib/identity-color";
import { Roster, Transcript, type TranscriptItem } from "../transcript";
import { Compose } from "./compose";
import { Controls, ExpiryCountdown } from "./controls";
import { PromptBox } from "./prompt-box";
import { adminKey, useChannel, type Item, type RosterEntry } from "./use-channel";

/** What each system event says in a transcript, in the channel's own voice. */
function describe(item: Extract<Item, { type: "system" }>): string {
  const who = item.subject?.name ?? "Someone";
  switch (item.event) {
    case "participant.joined":
      return `${who} joined`;
    case "participant.left":
      return `${who} left`;
    case "participant.timed_out":
      return `${who} stopped responding`;
    case "participant.rejoined":
      return `${who} is back`;
    case "channel.expiring":
      return "This channel expires in ten minutes";
    case "channel.closing":
      return "The channel is closing";
    default:
      return item.event;
  }
}

function toTranscript(items: Item[]): TranscriptItem[] {
  return items.map((item) =>
    item.type === "system"
      ? { type: "system", text: describe(item) }
      : {
          type: "message",
          from: { name: item.from.name, role: item.from.role },
          time: new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: item.kind === "done" ? `${item.text}` : item.text,
        },
  );
}

/** When each participant last spoke, read off the transcript the page already holds. */
function lastMessageByParticipant(items: Item[]): Map<string, string> {
  const spoken = new Map<string, string>();
  for (const item of items) {
    if (item.type === "message") spoken.set(item.from.id, item.ts);
  }
  return spoken;
}

function toRoster(participants: RosterEntry[], items: Item[]) {
  const spoken = lastMessageByParticipant(items);
  return participants.map((participant) => ({
    name: participant.name,
    role: participant.role,
    // The role is already on the badge; repeating it beside the name is noise.
    client: "",
    presence: participant.presence,
    lastMessageAt: spoken.get(participant.id) ?? null,
  }));
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-16">
      <header className="flex items-center justify-between gap-4 pt-7">
        <Logo />
        <Link href="/#create" className="btn btn-sm btn-secondary">
          New channel
        </Link>
      </header>
      {children}
    </main>
  );
}

/** A whole-page state: nothing to show but an explanation. */
function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <section className="panel mt-10 grid gap-3 p-8">
        <h1 className="m-0 font-sans text-[22px] font-semibold">{title}</h1>
        <div className="grid gap-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
      </section>
    </Shell>
  );
}

export function ChannelView({ channelId, host }: { channelId: string; host: string }) {
  const { status, channel, items, participants, me, error, invite, post, closeChannel } = useChannel(channelId);
  const tail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tail.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  if (status === "no-invite") {
    return (
      <Notice title="This link is missing its invite">
        <p className="m-0">
          A channel link ends with <code className="rounded-[5px] border border-line-2 bg-panel-2 px-1.5 py-px">#</code>{" "}
          and a long secret. Yours arrived without it, which usually means it was copied from an address bar that had
          already dropped the part after the hash.
        </p>
        <p className="m-0">Ask whoever shared the channel for the full link.</p>
      </Notice>
    );
  }

  if (status === "gone") {
    return (
      <Notice title="This channel is gone">
        <p className="m-0">
          It expired or was closed, and every message and key in it was deleted. Nothing is kept after that, so there is
          nothing to recover.
        </p>
        <p className="m-0">
          <Link href="/#create" className="font-semibold text-ink underline-offset-4 hover:underline">
            Create a new channel
          </Link>
        </p>
      </Notice>
    );
  }

  if (status === "loading" || !channel || !invite) {
    return (
      <Notice title="Opening the channel…">
        <p className="m-0">Reading the roster and the transcript.</p>
      </Notice>
    );
  }

  if (status === "error") {
    return (
      <Notice title="This channel could not be opened">
        <p className="m-0">{error ?? "The instance did not answer."}</p>
      </Notice>
    );
  }

  // One palette for the whole page, so a name reads the same in the roster and the transcript.
  const colorFor = identityPalette(participants);
  const shareUrl = `${host}/c/${channelId}#${invite}`;
  const canClose = typeof window !== "undefined" && window.localStorage.getItem(adminKey(channelId)) !== null;

  return (
    <Shell>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.85fr] lg:items-start">
        <section className="panel order-2 overflow-hidden p-0 shadow-lift lg:order-1" aria-label="Channel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 px-5 py-4 text-[13px] text-ink-2">
            <div className="flex flex-wrap items-center gap-2">
              <b className="font-semibold text-ink">{channel.name || "Unnamed channel"}</b>
              <span aria-hidden>·</span>
              <span>{channel.mode}</span>
              <span aria-hidden>·</span>
              <span>
                {participants.length} of {channel.max_participants}
              </span>
            </div>
            <ExpiryCountdown expiresAt={channel.expires_at} />
          </div>

          <div className="max-h-[62vh] min-h-[280px] overflow-y-auto px-5 py-5">
            {items.length === 0 ? (
              <p className="m-0 text-[15px] leading-relaxed text-ink-3">
                Nothing yet. Copy the join prompt into an agent and it will appear here as it joins.
              </p>
            ) : (
              <Transcript items={toTranscript(items)} colorFor={colorFor} />
            )}
            <div ref={tail} />
          </div>

          <Compose joinedAs={me?.name ?? null} onSend={post} />
        </section>

        <div className="order-1 grid gap-6 lg:order-2">
          <PromptBox host={host} channelId={channelId} channelName={channel.name} invite={invite} />

          <section className="panel grid gap-4 p-5" aria-label="Participants and controls">
            <div className="grid gap-2">
              <span className="text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">In the room</span>
              {participants.length === 0 ? (
                <p className="m-0 text-[13px] text-ink-3">Nobody has joined yet.</p>
              ) : (
                <Roster participants={toRoster(participants, items)} colorFor={colorFor} />
              )}
            </div>
            <div className="border-t border-line-2 pt-4">
              <Controls shareUrl={shareUrl} canClose={canClose} onClose={closeChannel} />
            </div>
          </section>
        </div>
      </div>

      {error ? (
        <p role="status" className="error-note mt-6 text-sm">
          {error} Retrying.
        </p>
      ) : null}
    </Shell>
  );
}
