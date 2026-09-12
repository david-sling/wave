"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "./use-channel";

/**
 * Where you had read up to (PRODUCT 6.2).
 *
 * Kept in this browser and nowhere else: a channel has no accounts, and where
 * one person stopped reading is nobody else's business. What counts as read is
 * what has been scrolled into view, not what has arrived — the page can be open
 * on a desk for an hour without that meaning anyone looked at it.
 *
 * The line itself is frozen for the visit. Reading moves the stored mark, but a
 * divider that slid down as your eye travelled would be a line you could never
 * catch up to.
 */

const readKey = (channelId: string) => `wave.read.${channelId}`;
/** Within this many pixels of the end counts as being at the end. */
const AT_BOTTOM = 120;

function storedSeq(channelId: string): number {
  try {
    return Number(window.localStorage.getItem(readKey(channelId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function storeSeq(channelId: string, seq: number): void {
  try {
    window.localStorage.setItem(readKey(channelId), String(seq));
  } catch {
    // Private browsing: the marker simply does not persist.
  }
}

export function useReadMarker(channelId: string, items: Item[], ready: boolean) {
  const scroller = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const readUpTo = useRef(0);
  const [markerAt, setMarkerAt] = useState<number | null>(null);

  const latest = items.at(-1)?.seq ?? 0;

  // The mark as it was when this visit started: the line is drawn from it and
  // stays put, however far the reader gets afterwards. Read after paint, not
  // during render — the server has no localStorage, and a marker that differed
  // between the two renders would be a hydration mismatch.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setMarkerAt((current) => {
        if (current !== null) return current;
        const stored = storedSeq(channelId);
        readUpTo.current = stored;
        return stored;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [channelId, ready]);

  /** Everything above the fold of the scroller has been seen. */
  const noteScrollPosition = useCallback(() => {
    const element = scroller.current;
    if (!element) return;

    const bottomEdge = element.scrollTop + element.clientHeight;
    let seen = readUpTo.current;
    for (const node of element.querySelectorAll<HTMLElement>("[data-seq]")) {
      const seq = Number(node.dataset.seq);
      if (node.offsetTop + node.offsetHeight <= bottomEdge && seq > seen) seen = seq;
    }
    if (element.scrollHeight - bottomEdge <= AT_BOTTOM) seen = Math.max(seen, latest);

    if (seen > readUpTo.current) {
      readUpTo.current = seen;
      storeSeq(channelId, seen);
    }
  }, [channelId, latest]);

  // Follow the conversation only when already at the end of it: yanking someone
  // out of the history they are reading is worse than missing a message.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const atBottom = element.scrollHeight - (element.scrollTop + element.clientHeight) <= AT_BOTTOM;
    if (atBottom) tail.current?.scrollIntoView({ block: "end" });
    noteScrollPosition();
  }, [items.length, noteScrollPosition]);

  return {
    scroller,
    tail,
    /** Draw the line before the first item past this seq. Null while unknown. */
    markerAt,
    onScroll: noteScrollPosition,
    unread: markerAt !== null && latest > markerAt,
  };
}
