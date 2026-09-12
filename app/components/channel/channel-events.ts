import type { Item } from "./use-channel";

/**
 * Channel events, announced (PRODUCT 6.5).
 *
 * Events are already in the transcript; a toast exists for the person who is
 * reading something else on the page when one happens. Only events, never
 * messages: a toast per message would be a second transcript competing with
 * the first.
 */

/** How loud each event is. What it says comes from the server (lib/events.ts). */
const KIND: Record<string, Announcement["kind"]> = {
  "participant.joined": "info",
  "participant.left": "info",
  "participant.rejoined": "info",
  "participant.timed_out": "warning",
  "channel.expiring": "warning",
  "channel.closing": "warning",
};

function announcement(item: Extract<Item, { type: "system" }>): Announcement | null {
  const kind = KIND[item.event];
  return kind && item.text ? { title: item.text, kind } : null;
}

/**
 * @param historyUpTo the channel's last seq when the page opened. Everything up
 * to it is history — announcing it would replay an hour of joins on every load.
 */
export type Announcement = { title: string; kind: "info" | "warning" };

/** What to say about an event, or nothing when it does not deserve a toast. */
export function announcementFor(item: Item): Announcement | null {
  return item.type === "system" ? announcement(item) : null;
}
