"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import type { BeforeSendEvent } from "@vercel/analytics";

/**
 * Web analytics, held to the counts-only promise (PRODUCT section 9).
 *
 * The tracker reads `location.href`, and on a channel page that string is the
 * secret: the id is in the path and, in e2ee mode, the key is in the fragment.
 * So every event from `/c/...` is rewritten to the bare route before it leaves
 * the browser. The visit is still counted; nothing that opens the channel is
 * ever sent.
 *
 * Marketing pages keep their query string so campaign attribution still works.
 * They carry nothing private: no channel is reachable from them without a link
 * the visitor already has.
 */
function redact(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url);
  if (!url.pathname.startsWith("/c/")) return event;
  return {
    ...event,
    url: `${url.origin}/c/[id]`,
  };
}

export function Analytics() {
  return <VercelAnalytics beforeSend={redact} />;
}
