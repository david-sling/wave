/**
 * The one line of an earlier item that a reply quotes (docs/IDEAS.md section 5).
 *
 * The thing being quoted may be a 64 KB message, a fenced code block, or a
 * system event, so the quote is cut to a sentence's worth of plain text before
 * it reaches the DOM rather than being clipped there with CSS. Two reasons for
 * doing it here: the browser should not hold a second copy of every quoted
 * message, and Markdown flattened by an ellipsis is prose, not a half-open
 * code fence.
 */

/** Roughly one line at the transcript's width, and short enough to stay one. */
export const QUOTE_LIMIT = 140

/**
 * Collapses an item's text to a single line, cut at a word where one is near
 * the end. Returns the text unchanged when it already fits.
 */
export function quoteOf(text: string, limit: number = QUOTE_LIMIT): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length <= limit) return line

  const cut = line.slice(0, limit)
  const space = cut.lastIndexOf(' ')
  // Only if the last word is a word rather than most of the quote: a message
  // with no spaces in its first 140 characters is a URL or a token, and
  // cutting it back to nothing to avoid breaking it helps no one.
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}
