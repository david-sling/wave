"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ReplyIcon } from "./icons";

/**
 * The "Reply" control on a transcript row, and the channel that carries the
 * click back to the composer.
 *
 * A context rather than a prop, for one structural reason: `transcript.tsx` is
 * a server component on the `/uses` pages, and a server component cannot be
 * handed a function. Passing `onReply` down would have forced `"use client"`
 * onto the whole transcript and shipped it, its seating and its marks into
 * the bundle of six marketing pages that have no composer to reply into.
 *
 * Outside a provider the control renders nothing at all, which is exactly
 * right for those pages: an example conversation has nowhere to put a reply.
 */

type Replier = (seq: number) => void;

const ReplyContext = createContext<Replier | null>(null);

export function ReplyProvider({ onReply, children }: { onReply: Replier; children: ReactNode }) {
  return <ReplyContext.Provider value={onReply}>{children}</ReplyContext.Provider>;
}

/**
 * Hidden until the row is hovered, and until it is focused, which is what
 * keeps it reachable by keyboard. Neither of those exists on a touch screen,
 * so where the device reports no hover it simply stands there: an affordance
 * revealed by a gesture the hardware cannot make is not an affordance. The
 * same `(hover: hover)` test gates the logo's wave, for the same reason.
 *
 * It is in the tab order in every state; only its paint changes, so a row
 * lighting up never reflows the message beside it.
 */
export function ReplyAction({ seq, author }: { seq?: number; author: string }) {
  const onReply = useContext(ReplyContext);
  if (!onReply || seq === undefined) return null;

  // The arrow, not the word. On a touch screen every row shows this control at
  // once, and eight instances of "Reply" down the edge compete with the names
  // they sit beside; eight small arrows read as one repeated affordance.
  // `title` because an icon alone deserves a tooltip where there is a pointer.
  return (
    <button
      type="button"
      onClick={() => onReply(seq)}
      aria-label={`Reply to ${author}`}
      title={`Reply to ${author}`}
      // Negative margin against the padding: the tap target grows past the
      // glyph without the row growing with it.
      className="-my-2 ml-auto shrink-0 rounded-[6px] p-2 text-ink-3 opacity-0 transition-opacity hover:text-ink-2 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
    >
      <ReplyIcon size={15} />
    </button>
  );
}

/** How long the answered message keeps the highlight after you are taken to it. */
const FLASH_MS = 1_400;

/**
 * Takes the reader to the message a quote points at, and says which one it is.
 *
 * Scrolling alone lands you in the middle of a transcript with no indication
 * of what you were brought to see, so the row holds `lilac-soft` for a moment
 * afterwards. Both halves respect a reduced-motion preference: the scroll
 * stops being smooth, and the highlight stops fading rather than disappearing.
 *
 * Deliberately a click and not an anchor. The channel page carries its invite
 * in the URL fragment, so `href="#item-7"` would navigate the invite away and
 * break the link the reader would go on to share.
 */
function reveal(seq: number): void {
  const target = document.querySelector(`[data-seq="${seq}"]`);
  if (!(target instanceof HTMLElement)) return;

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });

  target.classList.remove("seq-flash");
  // Reading a layout property between the two restarts the transition, so
  // clicking the same quote twice lights the row up twice.
  void target.offsetWidth;
  target.classList.add("seq-flash");
  window.setTimeout(() => target.classList.remove("seq-flash"), FLASH_MS);
}

export function JumpToSeq({ seq, label, children }: { seq: number; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={() => reveal(seq)} className="block w-full min-w-0 text-left" aria-label={label}>
      {children}
    </button>
  );
}
