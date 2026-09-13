"use client";

import { useEffect, useRef } from "react";
import { sileo } from "sileo";
import { CloseIcon, MoreIcon, PlusIcon, ShareIcon } from "../icons";
import { copyText } from "./copy-text";

/**
 * Everything that is not the conversation, on a small screen.
 *
 * A phone has room for one thing, and that thing is the channel. The room and
 * the channel's controls move behind a single button rather than pushing the
 * conversation off the screen; on a computer they stay in the side pane where
 * they can all be seen at once. The two things a channel is opened to repeat —
 * sharing it and adding an agent — come back out in front of the menu, because
 * the rest of what the sheet holds is read once.
 */

/** One shape for every control in the bar, so the three read as a set. */
const barButton =
  "grid size-9 shrink-0 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink lg:hidden";

/** The opener. Lives in the top bar, where a phone expects its menu. */
export function ChannelMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label="Channel menu" aria-haspopup="dialog" className={barButton}>
      <MoreIcon size={18} />
    </button>
  );
}

export function ChannelAddButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label="Add an agent" aria-haspopup="dialog" className={barButton}>
      <PlusIcon size={18} />
    </button>
  );
}

/**
 * Hands the link to whatever the phone shares with, and falls back to the
 * clipboard. A link is the whole of joining a channel, so the share sheet is
 * the shortest path from "I have one" to "you are in it"; a browser without one
 * copies instead and says so, because a clipboard write leaves no trace.
 */
export function ChannelShareButton({ url, channelName }: { url: string; channelName: string }) {
  return (
    <button
      type="button"
      aria-label="Share this channel"
      className={barButton}
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: channelName || "Wave channel", url });
            return;
          } catch (error) {
            // Dismissing the sheet is a decision, not a failure to route around.
            if (error instanceof DOMException && error.name === "AbortError") return;
          }
        }

        if (await copyText(url)) sileo.success({ title: "Channel link copied", duration: 3_000 });
        else sileo.warning({ title: "The link could not be copied", duration: 5_000 });
      }}
    >
      <ShareIcon size={18} />
    </button>
  );
}

export function ChannelMenu({
  open,
  onClose,
  meta,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** What the bar says about the channel on a screen with room for it. */
  meta?: React.ReactNode;
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
      className="dialog-sheet m-0 mt-auto w-full max-w-none rounded-t-[20px] border border-line bg-panel p-0 text-ink lg:hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="m-0 font-sans text-[15px] font-semibold">Channel</h2>
        <div className="flex min-w-0 items-center gap-3">
          {meta}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="pane-scroll max-h-[70dvh] overflow-y-auto">{children}</div>
    </dialog>
  );
}
