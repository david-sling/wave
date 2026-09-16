"use client";

import { useEffect, useRef, useState } from "react";
import { identityColor } from "@/lib/identity-color";
import { seatingOf } from "@/lib/seating";
import {
  IdentityTile,
  PresenceDot,
  RoleBadge,
  type ColorFor,
  type Participant,
} from "../transcript";

/**
 * Humans speak here. The first message joins them to the channel, which is why
 * the name is asked for once, at the point it starts to matter (PRODUCT 6.2).
 *
 * Sending empties the box immediately and leaves nothing waiting on the round
 * trip: the message is already in the transcript, dimmed, and the next one can
 * be typed while it lands.
 *
 * Typing `@` offers the room. What it inserts is plain text — the message is
 * stored, sent and delivered exactly as if the name had been typed by hand —
 * so this is a spelling aid, not an addressing mechanism. It exists because
 * names in a channel can be several words long and are deduplicated with a
 * suffix, and a mention only draws when it matches one exactly.
 */

/** Past this many characters with no match, whatever was typed is not a name. */
const MAX_QUERY = 48;

/** The same boundary `lib/mentions.ts` uses: an `@` after a letter is an email address. */
const WORD = /[\p{L}\p{N}_-]/u;

export type MentionToken = { at: number; query: string };

/**
 * The `@…` the caret is sitting in, if it is sitting in one.
 *
 * Walks back from the caret to the nearest `@` that could open a mention,
 * stopping at a newline: a name does not span lines, and without the stop a
 * stray `@` three paragraphs up would keep the menu open forever.
 */
export function tokenAt(text: string, caret: number): MentionToken | null {
  for (let index = caret - 1; index >= 0 && caret - index <= MAX_QUERY; index -= 1) {
    const character = text[index];
    if (character === "\n") return null;
    if (character !== "@") continue;

    const before = text[index - 1];
    if (before !== undefined && WORD.test(before)) return null;
    return { at: index, query: text.slice(index + 1, caret) };
  }
  return null;
}

/**
 * Who the query offers, best first.
 *
 * A name that starts with what was typed comes before one that merely contains
 * it, so "@da" offers "David" ahead of "Linda's agent". Everyone in the room is
 * offered, whatever their presence: a mention of someone who has gone quiet is
 * a thing a person means to write, and the row says so with its dot.
 */
export function suggest(participants: readonly Participant[], query: string): Participant[] {
  const wanted = query.toLowerCase();
  const opens: Participant[] = [];
  const holds: Participant[] = [];
  for (const participant of participants) {
    const name = participant.name.toLowerCase();
    if (name.startsWith(wanted)) opens.push(participant);
    else if (wanted.length > 0 && name.includes(wanted)) holds.push(participant);
  }
  return [...opens, ...holds];
}

export function Compose({
  joinedAs,
  onSend,
  participants = [],
  colorFor = identityColor,
}: {
  joinedAs: string | null;
  onSend: (text: string, name: string) => Promise<void>;
  /** The room, for the `@` menu. Empty on a surface that has no roster. */
  participants?: readonly Participant[];
  colorFor?: ColorFor;
}) {
  // The name is uncontrolled and read at send time: a browser autofilling it
  // does not always tell React, and a Send button that silently stays disabled
  // because of that is worse than asking for the name a moment later.
  const nameField = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [token, setToken] = useState<MentionToken | null>(null);
  const [active, setActive] = useState(0);
  /** Where the caret goes once React has written an accepted mention into the box. */
  const caretTo = useRef<number | null>(null);

  const ready = text.trim().length > 0;
  const offered = token === null ? [] : suggest(participants, token.query);
  const open = offered.length > 0;
  const chosen = offered[Math.min(active, offered.length - 1)];

  useEffect(() => {
    if (caretTo.current === null) return;
    box.current?.setSelectionRange(caretTo.current, caretTo.current);
    caretTo.current = null;
  });

  /** Reads the token under the caret. Called after anything that can move it. */
  function retrack(value: string, caret: number | null) {
    setToken(caret === null ? null : tokenAt(value, caret));
    setActive(0);
  }

  function accept(participant: Participant) {
    if (!token) return;
    const caret = box.current?.selectionStart ?? text.length;
    // A trailing space, so the next word is not read as part of the name.
    const inserted = `@${participant.name} `;
    setText(`${text.slice(0, token.at)}${inserted}${text.slice(caret)}`);
    caretTo.current = token.at + inserted.length;
    setToken(null);
  }

  async function send() {
    if (!ready) return;
    const name = nameField.current?.value.trim() ?? "";
    if (joinedAs === null && name.length === 0) {
      setFailure("Add a name first, so the agents know who is speaking.");
      nameField.current?.focus();
      return;
    }

    // Cleared before the request, not after it: the message is already in the
    // transcript, waiting, so leaving it here too would show it twice.
    const said = text.trim();
    setFailure(null);
    setText("");
    setToken(null);
    try {
      await onSend(said, name);
    } catch (error) {
      // It never made it, so it comes back — unless something new is already
      // being typed, which is not worth clobbering.
      setText((current) => (current.length === 0 ? said : current));
      setFailure(error instanceof Error ? error.message : "The message did not send.");
    }
  }

  const seatOf = seatingOf(participants);

  return (
    <div className="grid gap-2.5 px-4 py-3 lg:px-6">
      {joinedAs === null ? (
        <div className="flex items-center gap-2">
          <label htmlFor="human-name" className="shrink-0 text-[13px] font-semibold">
            Your name
          </label>
          <input
            id="human-name"
            ref={nameField}
            className="input h-9 max-w-[220px] text-sm"
            placeholder="David"
            maxLength={40}
            autoComplete="name"
          />
          <span className="text-xs text-ink-3">shown to the agents</span>
        </div>
      ) : null}

      <div className="relative grid gap-2">
        <label htmlFor="compose" className="sr-only">
          Message
        </label>
        {/* Above the box rather than below it: the composer is already at the
            bottom of the window, and a menu hanging off it would be off screen. */}
        {open ? (
          <ul
            id="mention-menu"
            role="listbox"
            aria-label="Participants"
            className="absolute bottom-full left-0 z-20 mb-1.5 max-h-56 w-full max-w-[300px] overflow-y-auto rounded-[12px] border border-line bg-panel p-1 shadow-soft"
          >
            {offered.map((participant, index) => (
              <li
                key={participant.name}
                id={`mention-${index}`}
                role="option"
                aria-selected={participant === chosen}
                // Mouse down, not click: the textarea would lose focus first,
                // and with it the caret this has to write into.
                onMouseDown={(event) => {
                  event.preventDefault();
                  accept(participant);
                }}
                onMouseEnter={() => setActive(index)}
                className={`grid cursor-pointer grid-cols-[18px_1fr_auto] items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] ${
                  participant === chosen ? "bg-panel-2" : ""
                }`}
              >
                <IdentityTile
                  name={participant.name}
                  colour={colorFor(participant.name, participant.role)}
                  seat={seatOf(participant.name)}
                />
                <span className="min-w-0 truncate font-medium">{participant.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <RoleBadge role={participant.role} />
                  <PresenceDot presence={participant.presence} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          id="compose"
          ref={box}
          role="combobox"
          aria-expanded={open}
          aria-controls="mention-menu"
          aria-autocomplete="list"
          aria-activedescendant={open ? `mention-${Math.min(active, offered.length - 1)}` : undefined}
          className="input h-auto min-h-[52px] resize-y py-2.5 leading-relaxed"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            retrack(event.target.value, event.target.selectionStart);
          }}
          onSelect={(event) => retrack(event.currentTarget.value, event.currentTarget.selectionStart)}
          onBlur={() => setToken(null)}
          onKeyDown={(event) => {
            // ⌘↵ sends whatever is open: the menu is an aid to writing the
            // message, never a thing standing between it and being sent.
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              void send();
              return;
            }
            if (!open) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : offered.length - 1;
              setActive((current) => (Math.min(current, offered.length - 1) + step) % offered.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              accept(chosen);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setToken(null);
            }
          }}
          placeholder={joinedAs ? `Say something as ${joinedAs}…` : "Say something to the agents…"}
          maxLength={4_000}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void send()} disabled={!ready}>
          Send
        </button>
        <span className="text-xs text-ink-3">
          &#8984;&#8629; to send. Agents see it in their next poll.
          {participants.length > 0 ? " Type @ to name someone." : ""}
        </span>
      </div>

      {failure ? (
        <p role="status" className="error-note m-0 text-sm">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
