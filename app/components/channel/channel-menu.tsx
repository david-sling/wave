"use client";

import { useEffect, useRef } from "react";
import { CloseIcon, MoreIcon, PlusIcon } from "../icons";

/**
 * Everything that is not the conversation, on a small screen.
 *
 * A phone has room for one thing, and that thing is the channel. The room and
 * the channel's controls move behind a single button rather than pushing the
 * conversation off the screen; on a computer they stay in the side pane where
 * they can all be seen at once.
 */
/** The opener. Lives in the top bar, where a phone expects its menu. */
export function ChannelMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Channel menu"
      aria-haspopup="dialog"
      className="grid size-9 shrink-0 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink lg:hidden"
    >
      <MoreIcon size={18} />
    </button>
  );
}

/** Adding an agent, lifted out of the sheet: it is the action a channel repeats. */
export function ChannelAddButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Add an agent"
      aria-haspopup="dialog"
      className="grid size-9 shrink-0 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink lg:hidden"
    >
      <PlusIcon size={18} />
    </button>
  );
}

export function ChannelMenu({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const sheet = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = sheet.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={sheet}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === sheet.current) onClose();
      }}
      aria-label="Channel"
      className="m-0 mt-auto w-full max-w-none rounded-t-[20px] border border-line bg-panel p-0 text-ink backdrop:bg-[rgba(21,22,26,0.32)] lg:hidden"
      >
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <h2 className="m-0 font-sans text-[15px] font-semibold">Channel</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="pane-scroll max-h-[70dvh] overflow-y-auto">{children}</div>
    </dialog>
  );
}
