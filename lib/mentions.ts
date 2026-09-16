/**
 * `@name` in a message body (docs/IDEAS.md section 4).
 *
 * Display only. A mention is ordinary text in the message: nothing resolves it
 * server-side, nothing is stored beside it, and poll returns the same items to
 * everyone whether they are named or not. Addressing is not filtering — that
 * line is what keeps `seq` meaning the same thing to every reader.
 *
 * The roster is the dictionary. A mention is recognised only when what follows
 * the `@` is the name of someone in this channel, which is what makes names
 * with spaces work — "@David's agent" is one mention, not a mention of "David"
 * followed by prose — and what degrades a mention of nobody to plain text
 * without a rule of its own. Names are already unique within a channel
 * (`dedupeName`), so no namespace had to be invented for this.
 */

export type MentionMatch = {
  /** Index of the `@` in the text. */
  index: number
  /** Characters consumed, `@` included. */
  length: number
  /** The roster name that matched, in the roster's spelling. */
  name: string
}

/**
 * What may not sit either side of a mention. Unicode-aware, because names are:
 * an `@` after a letter is an email address, and a letter after the name means
 * the reader typed past whoever matched. The hyphen counts as a letter here —
 * "@david-sling" is one handle and not a mention of David with a tail.
 */
const WORD = /[\p{L}\p{N}_-]/u

function matchesAt(text: string, at: number, name: string): boolean {
  if (text.slice(at, at + name.length).toLowerCase() !== name.toLowerCase()) return false
  const after = text[at + name.length]
  return after === undefined || !WORD.test(after)
}

/**
 * Every mention in a string, left to right and never overlapping.
 *
 * Longest name first, so a room holding both "David" and "David's agent" reads
 * "@David's agent" as the longer of the two rather than as the shorter one
 * with a possessive stuck to it.
 */
export function findMentions(text: string, names: readonly string[]): MentionMatch[] {
  const ordered = [...new Set(names.filter((name) => name.length > 0))].sort((a, b) => b.length - a.length)
  if (ordered.length === 0) return []

  const found: MentionMatch[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '@') continue
    const before = text[index - 1]
    if (before !== undefined && WORD.test(before)) continue

    const name = ordered.find((candidate) => matchesAt(text, index + 1, candidate))
    if (!name) continue

    found.push({ index, length: name.length + 1, name })
    index += name.length
  }
  return found
}

/**
 * The parts of a mdast tree a mention may appear in. Only `text` nodes are
 * visited, which is the whole of why code is left alone: `inlineCode` and
 * `code` carry a `value` and no children, so an `@name` inside backticks or a
 * fenced block is never reached.
 */
type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
  data?: Record<string, unknown>
}

/**
 * A remark plugin that splits mentions out of the text so they can be drawn.
 *
 * The mention becomes a `span.mention` carrying the author's own spelling —
 * `@david` stays `@david` rather than being corrected to the roster's case.
 * The message is the record; the highlight is the only thing saying it
 * resolved.
 */
export function remarkMentions(names: readonly string[]) {
  return function attach() {
    return function transform(tree: MarkdownNode): void {
      if (names.length > 0) divide(tree, names)
    }
  }
}

function divide(node: MarkdownNode, names: readonly string[]): void {
  if (!node.children) return

  const rebuilt: MarkdownNode[] = []
  for (const child of node.children) {
    if (child.type !== 'text' || typeof child.value !== 'string') {
      divide(child, names)
      rebuilt.push(child)
      continue
    }
    rebuilt.push(...split(child.value, names))
  }
  node.children = rebuilt
}

function split(text: string, names: readonly string[]): MarkdownNode[] {
  const found = findMentions(text, names)
  if (found.length === 0) return [{ type: 'text', value: text }]

  const parts: MarkdownNode[] = []
  let at = 0
  for (const mention of found) {
    if (mention.index > at) parts.push({ type: 'text', value: text.slice(at, mention.index) })
    parts.push({
      type: 'mention',
      // `hName` and `hProperties` are how mdast-util-to-hast is told what an
      // unknown node becomes, so nothing here has to know about rehype.
      data: { hName: 'span', hProperties: { className: ['mention'] } },
      children: [{ type: 'text', value: text.slice(mention.index, mention.index + mention.length) }],
    })
    at = mention.index + mention.length
  }
  if (at < text.length) parts.push({ type: 'text', value: text.slice(at) })
  return parts
}
