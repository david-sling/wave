/**
 * The project's own repository, and how many people have starred it.
 *
 * The URL lives here because the star control, the nav and the footer all
 * point at it. The count is a marketing number and nothing depends on it, so
 * every failure path returns `null` and the control renders as a plain ask:
 * a landing page must not fail to build because GitHub was slow or had run
 * out of anonymous requests for this IP.
 */

import { cache } from "react";

export const repoUrl = "https://github.com/david-sling/wave";

const api = "https://api.github.com/repos/david-sling/wave";

/** How long a count is served before it is fetched again. */
const REVALIDATE_SECONDS = 3600;

/** Past this the request is abandoned; a stale count beats a slow page. */
const TIMEOUT_MS = 2500;

/**
 * The star count, or `null` when GitHub did not answer.
 *
 * `null` means unknown, not zero: a count of nought is a real answer and is
 * shown as one.
 *
 * Wrapped in `cache` rather than left to fetch's own memoisation, because the
 * abort signal opts this request out of that (it matches on the signal), and
 * the nav and the footer both ask within one render.
 */
export const starCount = cache(async (): Promise<number | null> => {
  try {
    const response = await fetch(api, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const stars = (body as { stargazers_count?: unknown }).stargazers_count;
    if (typeof stars !== "number" || !Number.isFinite(stars)) return null;
    return Math.max(0, Math.floor(stars));
  } catch {
    return null;
  }
});

/**
 * A count at the width a nav chip can hold: 128, 1.2k, 12k.
 *
 * Rounded to tenths before the branch, not after: `toFixed` on the raw
 * quotient reads 9950 as 9.9k, because 9.95 is not 9.95 in binary.
 */
export function formatStars(count: number): string {
  if (count < 1000) return String(count);
  const tenths = Math.round(count / 100) / 10;
  return `${tenths < 10 ? tenths : Math.round(tenths)}k`;
}
