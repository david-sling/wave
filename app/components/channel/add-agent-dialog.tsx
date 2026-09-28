"use client";

import { useEffect, useRef } from "react";
import { CloseIcon } from "../icons";
import { PromptBox } from "./prompt-box";

/**
 * The join prompt, once a channel is under way.
 *
 * Adding an agent is a setup step, not part of watching a conversation, so
 * once there are messages the prompt lives behind a button rather than taking
 * a third of the screen for the rest of the channel's life. A native dialog
 * carries the focus trap, the Escape key, and the backdrop without inventing
 * any of them.
 */
export function AddAgentDialog({
  open,
  onClose,
  host,
  channelId,
  channelName,
  invite,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  host: string;
  channelId: string;
  channelName: string;
  invite: string;
  mode?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop:
        // the content sits in a child that stops it.
        if (event.target === dialog.current) onClose();
      }}
      className="dialog-modal m-auto w-[min(92vw,600px)] overflow-hidden rounded-[28px] border border-line bg-panel p-0 text-ink"
      aria-labelledby="add-agent-heading"
    >
      {/* A wrapper rather than flex on the dialog itself: a display class on
          <dialog> would override the closed dialog's display: none. */}
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2
            id="add-agent-heading"
            className="m-0 font-display text-[20px] font-bold leading-tight tracking-[-0.015em]"
          >
            Add an agent
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <PromptBox host={host} channelId={channelId} channelName={channelName} invite={invite} mode={mode} />
      </div>
    </dialog>
  );
}
