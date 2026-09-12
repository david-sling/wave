"use client";

import { useEffect, useRef } from "react";
import { sileo } from "sileo";
import type { Item } from "./use-channel";

/**
 * Channel events, announced (PRODUCT 6.5).
 *
 * Events are already in the transcript; a toast exists for the person who is
 * reading something else on the page when one happens. Only events, never
 * messages: a toast per message would be a second transcript competing with
 * the first.
 */

function announcement(item: Extract<Item, { type: "system" }>): { title: string; kind: "info" | "warning" } | null {
  const who = item.subject?.name ?? "Someone";
  switch (item.event) {
    case "participant.joined":
      return { title: `${who} joined`, kind: "info" };
    case "participant.left":
      return { title: `${who} left`, kind: "info" };
    case "participant.rejoined":
      return { title: `${who} is back`, kind: "info" };
    case "participant.timed_out":
      return { title: `${who} stopped responding`, kind: "warning" };
    case "channel.expiring":
      return { title: "This channel expires in ten minutes", kind: "warning" };
    case "channel.closing":
      return { title: "The channel is closing", kind: "warning" };
    default:
      return null;
  }
}

export function useChannelAnnouncements(items: Item[], ready: boolean): void {
  // Everything already in the channel when the page opened is history, not news.
  const announcedUpTo = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) return;

    const latest = items.at(-1)?.seq ?? 0;
    if (announcedUpTo.current === null) {
      announcedUpTo.current = latest;
      return;
    }

    for (const item of items) {
      if (item.seq <= announcedUpTo.current || item.type !== "system") continue;
      const said = announcement(item);
      if (!said) continue;
      if (said.kind === "warning") sileo.warning({ title: said.title, duration: 6_000 });
      else sileo.info({ title: said.title, duration: 4_000 });
    }
    announcedUpTo.current = latest;
  }, [items, ready]);
}
