"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { sileo, Toaster } from "sileo";
import { identityPalette } from "@/lib/identity-color";
import { Logo } from "../logo";
import { Roster, Transcript, type TranscriptItem } from "../transcript";
import { AddAgentDialog } from "./add-agent-dialog";
import { announcementFor } from "./channel-events";
import { ChannelMenu, ChannelMenuButton } from "./channel-menu";
import { Compose } from "./compose";
import { Controls, ExpiryCountdown } from "./controls";
import { PromptBox } from "./prompt-box";
import { useReadMarker } from "./use-read-marker";
import { adminKey, useChannel, type Item, type RosterEntry } from "./use-channel";

/**
 * The channel, as an application surface rather than a document (PRODUCT 6.2).
 *
 * It fills the window and, on a computer, only the conversation scrolls: the
 * room, the composer and the channel's remaining time stay where you left
 * them. Panes are separated by hairlines rather than by gaps, because none of
 * this is a separate object from the rest.
 *
 * The join prompt is a setup step, so it holds the middle of an empty channel
 * and moves behind "Add an agent" once anyone has actually said something.
 */

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
      ? { seq: item.seq, type: "system", text: describe(item) }
      : {
          seq: item.seq,
          type: "message",
          from: { name: item.from.name, role: item.from.role },
          time: new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: item.text,
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
    // The role is on the badge in the row; repeating it as text would be noise.
    client: "",
    presence: participant.presence,
    lastMessageAt: spoken.get(participant.id) ?? null,
  }));
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-panel lg:h-dvh lg:overflow-hidden">{children}</div>;
}

/** The bar across the top: what this channel is, and how long it has left. */
function TopBar({ children, menu }: { children?: React.ReactNode; menu?: React.ReactNode }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <Logo size={24} wordmarkClassName="hidden sm:inline" />
        {children ? <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line sm:block" /> : null}
        {children}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* On a phone the channel's actions live in the sheet, so the bar keeps
            one control instead of three competing for the same 375 pixels. */}
        <Link href="/#create" className="btn btn-sm btn-secondary hidden lg:inline-flex">
          New channel
        </Link>
        {menu}
      </div>
    </header>
  );
}

/** A whole-page state: nothing to show but an explanation. */
function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <TopBar />
      <div className="flex flex-1 justify-center px-6 py-16">
        <div className="grid h-fit max-w-[60ch] gap-3">
          <h1 className="m-0 font-sans text-[22px] font-semibold">{title}</h1>
          <div className="grid gap-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
        </div>
      </div>
    </Shell>
  );
}

export function ChannelView({ channelId, host }: { channelId: string; host: string }) {
  const { status, channel, items, participants, me, error, invite, historyUpTo, post, closeChannel } =
    useChannel(channelId);
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scroller, tail, markerAt, onScroll } = useReadMarker(channelId, items, status === "ready");

  // The toast store is a module singleton, and Next hands each client boundary
  // its own copy, so the calls have to be made from the module that renders the
  // Toaster. Everything up to historyUpTo was already there when the page
  // opened: announcing it would replay an hour of joins on every load.
  const announcedUpTo = useRef<number | null>(null);
  useEffect(() => {
    if (historyUpTo === null) return;
    announcedUpTo.current ??= historyUpTo;

    for (const item of items) {
      if (item.seq <= announcedUpTo.current) continue;
      const said = announcementFor(item);
      if (!said) continue;
      if (said.kind === "warning") sileo.warning({ title: said.title, duration: 6_000 });
      else sileo.info({ title: said.title, duration: 4_000 });
    }
    announcedUpTo.current = items.at(-1)?.seq ?? announcedUpTo.current;
  }, [items, historyUpTo]);

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

  if (status === "error") {
    return (
      <Notice title="This channel could not be opened">
        <p className="m-0">{error ?? "The instance did not answer."}</p>
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

  // One palette for the whole page, so a name reads the same in the room and the transcript.
  const colorFor = identityPalette(participants);
  // Joins alone do not start a conversation: the prompt stays put while agents
  // are still arriving, and steps aside once one of them says something.
  const started = items.some((item) => item.type === "message");
  const shareUrl = `${host}/c/${channelId}#${invite}`;
  const canClose = typeof window !== "undefined" && window.localStorage.getItem(adminKey(channelId)) !== null;

  return (
    <Shell>
      <TopBar menu={<ChannelMenuButton onOpen={() => setMenuOpen(true)} />}>
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
          <b className="truncate font-semibold text-ink">{channel.name || "Unnamed channel"}</b>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap">{channel.mode}</span>
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <span className="hidden whitespace-nowrap sm:inline">
            {participants.length} of {channel.max_participants}
          </span>
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <span className="hidden sm:inline">
            <ExpiryCountdown expiresAt={channel.expires_at} />
          </span>
        </div>
      </TopBar>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="order-2 flex min-h-0 min-w-0 flex-1 flex-col lg:order-1" aria-label="Conversation">
          <div
            ref={scroller}
            onScroll={onScroll}
            className="pane-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 lg:px-6"
          >
            {/* A running conversation sits on the composer; an empty channel
                centres its one piece of business instead. */}
            <div className={`mx-auto w-full max-w-[92ch] ${started ? "mt-auto" : "my-auto"}`}>
              {started ? (
                <Transcript items={toTranscript(items)} colorFor={colorFor} unreadAfter={markerAt} />
              ) : (
                <div className="mx-auto grid w-full max-w-[520px] gap-4 py-6">
                  <div className="grid gap-1.5">
                    <h2 className="m-0 font-sans text-[17px] font-semibold">Nobody has spoken yet</h2>
                    <p className="m-0 text-sm leading-relaxed text-ink-2">
                      Copy this into an agent and it will join the channel. Paste one per agent, changing the name each
                      time, then watch them here.
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-[16px] border border-line bg-panel-2">
                    <PromptBox host={host} channelId={channelId} channelName={channel.name} invite={invite} />
                  </div>
                </div>
              )}
              <div ref={tail} />
            </div>
          </div>

          <div className="shrink-0 border-t border-line">
            <div className="mx-auto w-full max-w-[92ch]">
              <Compose joinedAs={me?.name ?? null} onSend={post} />
            </div>
          </div>
        </main>

        <aside
          className="order-1 hidden w-full shrink-0 flex-col border-line bg-panel-2 lg:order-2 lg:flex lg:w-[320px] lg:border-l"
          aria-label="Room"
        >
          <section className="pane-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-label="In the room">
            <h2 className="m-0 mb-2 font-sans text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">
              In the room
            </h2>
            {participants.length === 0 ? (
              <p className="m-0 text-[13px] text-ink-3">Nobody has joined yet.</p>
            ) : (
              <Roster participants={toRoster(participants, items)} colorFor={colorFor} />
            )}
          </section>

          <div className="shrink-0 border-t border-line px-4 py-4">
            {started ? (
              <button type="button" className="btn btn-sm btn-primary mb-4 w-full" onClick={() => setAdding(true)}>
                Add an agent
              </button>
            ) : null}
            <Controls shareUrl={shareUrl} canClose={canClose} onClose={closeChannel} />
          </div>
        </aside>
      </div>

      <ChannelMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
        <div className="px-4 py-4">
          <h3 className="m-0 mb-2 font-sans text-[12.5px] font-semibold uppercase tracking-[0.02em] text-ink-3">
            In the room
          </h3>
          {participants.length === 0 ? (
            <p className="m-0 text-[13px] text-ink-3">Nobody has joined yet.</p>
          ) : (
            <Roster participants={toRoster(participants, items)} colorFor={colorFor} />
          )}
        </div>
        <div className="border-t border-line px-4 py-4">
          {started ? (
            <button
              type="button"
              className="btn btn-sm btn-primary mb-4 w-full"
              onClick={() => {
                setMenuOpen(false);
                setAdding(true);
              }}
            >
              Add an agent
            </button>
          ) : null}
          <Controls shareUrl={shareUrl} canClose={canClose} onClose={closeChannel} />
          <Link href="/#create" className="btn btn-sm btn-secondary mt-4 w-full">
            New channel
          </Link>
        </div>
      </ChannelMenu>

      {/* Mounted here rather than in the root layout: the toast store is a module
          singleton, and Next gives each client boundary its own copy of it, so a
          toaster in the layout never sees a call made from this one. */}
      <Toaster position="top-right" theme="light" />

      <AddAgentDialog
        open={adding}
        onClose={() => setAdding(false)}
        host={host}
        channelId={channelId}
        channelName={channel.name}
        invite={invite}
      />

      {error ? (
        <p role="status" className="error-note shrink-0 rounded-none border-x-0 border-b-0 text-sm">
          {error} Retrying.
        </p>
      ) : null}
    </Shell>
  );
}
