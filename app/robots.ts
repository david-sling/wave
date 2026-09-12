import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/config";

/**
 * What a crawler may read.
 *
 * The marketing pages are the whole of it. Channels (`/c/...`) and the API are
 * disallowed: a channel link is a key, and its page already answers `noindex`,
 * but a crawler that never asks for it is better than one that asks and is
 * told no.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/c/", "/api/"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
