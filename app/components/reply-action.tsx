"use client";

import { createContext, useContext, type ReactNode } from "react";

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
 * Hidden until the row is hovered, and until it is focused — the second half
 * is what keeps it reachable by keyboard and on a phone, where the first half
 * never fires. It stays in the tab order either way; only its paint changes,
 * so nothing reflows when a row lights up.
 */
export function ReplyAction({ seq, author }: { seq?: number; author: string }) {
  const onReply = useContext(ReplyContext);
  if (!onReply || seq === undefined) return null;

  return (
    <button
      type="button"
      onClick={() => onReply(seq)}
      className="ml-auto shrink-0 rounded-[6px] px-1.5 py-px text-xs font-semibold text-ink-3 opacity-0 transition-opacity hover:text-ink-2 focus-visible:opacity-100 group-hover:opacity-100"
    >
      Reply
      <span className="sr-only"> to {author}</span>
    </button>
  );
}
