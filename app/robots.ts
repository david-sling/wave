import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/config";

/**
 * What a crawler may fetch.
 *
 * Everything but the API. Channels (`/c/...`) are deliberately not listed
 * here: a channel link is pasted into chats, and the card the chat draws for
 * it comes from a bot fetching the page, so the bots have to be let in. Some
 * of them, X's among them, honour a disallow and would show a bare URL. What
 * keeps a channel out of search results is the page itself, which answers
 * `noindex, nofollow` (lib/channel-card.ts). That is also the stronger
 * control: a crawler forbidden to fetch a page cannot read its `noindex`, and
 * may list the bare URL if it finds a link to it, while a crawler that reads
 * the tag drops the page entirely.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
