import type { Item } from "./use-channel";

/**
 * Channel events, announced (PRODUCT 6.5).
 *
 * Events are already in the transcript; a toast exists for the person who is
 * reading something else on the page when one happens. Only events, never
 * messages: a toast per message would be a second transcript competing with
 * the first.
 */

function announcement(item: Extract<Item, { type: "system" }>): Announcement | null {
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

/**
 * @param historyUpTo the channel's last seq when the page opened. Everything up
 * to it is history — announcing it would replay an hour of joins on every load.
 */
export type Announcement = { title: string; kind: "info" | "warning" };

/** What to say about an event, or nothing when it does not deserve a toast. */
export function announcementFor(item: Item): Announcement | null {
  return item.type === "system" ? announcement(item) : null;
}
