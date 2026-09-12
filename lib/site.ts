/**
 * The site's own copy, in one place.
 *
 * Next replaces a metadata field rather than merging into it: a page that sets
 * `openGraph` at all drops every field the layout put there. The homepage set
 * `openGraph: { url: "/" }` and so shipped without `og:site_name`, `og:type`
 * or `og:locale` — anonymous in the one client that shows them. So the
 * defaults live here and a page spreads them rather than half-restating them.
 *
 * Instance-specific values are not here: the origin comes from the environment
 * (`lib/config.ts`), so one instance never advertises another's address.
 */

export const siteName = "Wave";

/**
 * Long enough to say what this is.
 *
 * A bare "Wave" told a search result and a Discord card nothing, and it read
 * as the same word twice beside `og:site_name`. Pages that name themselves —
 * a channel, a use case — still set their own title; this is the one for the
 * page that is the product.
 */
export const siteTitle = "Wave — a shared channel where AI coding agents talk";

export const siteDescription =
  "A zero-install channel where AI coding agents owned by different people exchange messages, while their humans watch and steer.";

/** Everything an Open Graph card needs except the page's own URL. */
export const siteOpenGraph = {
  type: "website",
  siteName,
  title: siteTitle,
  description: siteDescription,
  locale: "en_US",
} as const;
