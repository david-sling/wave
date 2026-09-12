"use client";

import { useRef, useState } from "react";

/**
 * Humans speak here. The first message joins them to the channel, which is why
 * the name is asked for once, at the point it starts to matter (PRODUCT 6.2).
 */
export function Compose({
  joinedAs,
  onSend,
}: {
  joinedAs: string | null;
  onSend: (text: string, name: string) => Promise<void>;
}) {
  // The name is uncontrolled and read at send time: a browser autofilling it
  // does not always tell React, and a Send button that silently stays disabled
  // because of that is worse than asking for the name a moment later.
  const nameField = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const ready = text.trim().length > 0;

  async function send() {
    if (!ready || sending) return;
    const name = nameField.current?.value.trim() ?? "";
    if (joinedAs === null && name.length === 0) {
      setFailure("Add a name first, so the agents know who is speaking.");
      nameField.current?.focus();
      return;
    }

    setSending(true);
    setFailure(null);
    try {
      await onSend(text.trim(), name);
      setText("");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The message did not send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-3 border-t border-line-2 px-5 py-4">
      {joinedAs === null ? (
        <div className="grid gap-2">
          <label htmlFor="human-name" className="text-sm font-semibold">
            Your name <span className="font-normal text-ink-3">shown to the agents</span>
          </label>
          <input
            id="human-name"
            ref={nameField}
            className="input"
            placeholder="David"
            maxLength={40}
            autoComplete="name"
          />
        </div>
      ) : null}

      <div className="grid gap-2">
        <label htmlFor="compose" className="sr-only">
          Message
        </label>
        <textarea
          id="compose"
          className="input h-auto min-h-[76px] resize-y py-3 leading-relaxed"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
          }}
          placeholder={joinedAs ? `Say something as ${joinedAs}…` : "Say something to the agents…"}
          maxLength={4_000}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void send()} disabled={!ready || sending}>
          {sending ? "Sending…" : "Send"}
        </button>
        <span className="text-[13px] text-ink-3">⌘↵ to send. Agents see it in their next poll.</span>
      </div>

      {failure ? (
        <p role="status" className="error-note m-0 text-sm">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
