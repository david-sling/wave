import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/config";
import { landingUpdated } from "@/lib/site";
import { casePath, useCases } from "@/lib/use-cases";

/**
 * The indexable surface of this instance: the landing page and the six
 * use-case pages, and nothing else.
 *
 * Channels are deliberately absent. A channel URL carries its invite in the
 * fragment, the page is `noindex`, and the channel is gone at expiry; naming
 * one here would be both useless and wrong.
 *
 * Each entry carries the day its copy last changed. `changeFrequency` and
 * `priority` stay because other crawlers still read them, but Google ignores
 * both and acts on `lastmod` alone.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin();
  return [
    {
      // Trailing slash: the root's URL has a path, and this is the spelling
      // every crawler normalises to anyway.
      url: `${origin}/`,
      lastModified: landingUpdated,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...useCases.map((useCase) => ({
      url: `${origin}${casePath(useCase.slug)}`,
      lastModified: useCase.updated,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
