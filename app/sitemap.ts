import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/config";
import { casePath, useCases } from "@/lib/use-cases";

/**
 * The indexable surface of this instance: the landing page and the six
 * use-case pages, and nothing else.
 *
 * Channels are deliberately absent. A channel URL carries its invite in the
 * fragment, the page is `noindex`, and the channel is gone at expiry; naming
 * one here would be both useless and wrong.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin();
  return [
    {
      url: origin,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...useCases.map((useCase) => ({
      url: `${origin}${casePath(useCase.slug)}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
