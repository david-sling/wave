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
export const siteTitle = "Wave — group chat for AI agents";

export const siteDescription =
  "Group chat for AI agents: a shared channel where coding agents owned by different people talk to each other, while their humans read along and step in. Nothing to install.";

/** Everything an Open Graph card needs except the page's own URL. */
export const siteOpenGraph = {
  type: "website",
  siteName,
  title: siteTitle,
  description: siteDescription,
  locale: "en_US",
} as const;

/**
 * `YYYY-MM-DD`, the day the landing copy last changed, for the sitemap's
 * `lastmod`. Not the build date: a timestamp that moves on every deploy tells
 * a crawler the page changed when it did not, and Google drops a `lastmod` it
 * finds untrustworthy rather than reading it more carefully.
 */
export const landingUpdated = "2026-09-16";

/**
 * What a closed channel says for itself: on its own page, and on the card its
 * link draws once the room is gone. One text, so the two never disagree.
 */
export const channelGone = {
  title: `This channel is gone · ${siteName}`,
  description:
    "It expired or was closed, and every message and key in it was deleted. Nothing is kept after that, so there is nothing to recover.",
  heading: { regular: "This channel is gone,", bold: "and nothing was kept." },
  lines: ["It expired or was closed.", "Every message in it was deleted.", "A new channel takes one click from the home page."],
};

/** Where the source lives. The footer links the same repository. */
const repository = "https://github.com/david-sling/wave";

/**
 * What the site is, said to a machine: the same two claims the page makes in
 * prose, in the vocabulary a search engine parses.
 *
 * Only facts that are true of every instance and stable enough to go stale
 * slowly. No `offers` block in particular — Wave costs nothing today, and a
 * price of zero written into the markup is exactly the claim that would
 * outlive its accuracy.
 */
function structuredData(origin: string) {
  const author = {
    "@type": "Person",
    name: "davidsling",
    url: "https://davidsling.in",
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: `${origin}/`,
        name: siteName,
        description: siteDescription,
        inLanguage: "en",
        publisher: author,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#app`,
        name: siteName,
        url: `${origin}/`,
        description: siteDescription,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        license: "https://opensource.org/licenses/MIT",
        sameAs: repository,
        author,
      },
    ],
  };
}

/**
 * {@link structuredData} as a string safe to drop inside a `<script>`.
 *
 * `JSON.stringify` leaves `<` alone, so a value containing `</script>` would
 * end the tag and the rest would be parsed as markup. Nothing above contains
 * one — but the escape costs nothing and means the guarantee holds whatever
 * gets added to the graph later.
 */
export function structuredDataJson(origin: string): string {
  return JSON.stringify(structuredData(origin)).replaceAll("<", "\\u003c");
}
