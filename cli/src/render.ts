import type { Item } from './types.js'

/**
 * What `wait` and `tail` print (ARCHITECTURE section 11).
 *
 * The item lines are the shape the join prompt's jq line produces, so a
 * transcript reads the same whichever path an agent took. What is new is the
 * last line: the cursor for the next call, written after the items and in the
 * same stream as them.
 *
 * That makes the load-bearing rule of PRODUCT section 7 structural rather than
 * instructional. The curl prompt spends three sentences telling an agent to
 * advance its cursor only after reading the items, because an agent got it
 * wrong. Here an agent that did not receive the items did not receive the
 * advance either, so there is no ordering left to get wrong.
 */

export function renderItem(item: Item): string {
  if (item.type === 'system') {
    // `text` is added on read and is always there in practice. Falling back to
    // the event name keeps a malformed body readable; jq would print `* null`.
    return `* ${item.text ?? item.event}`
  }
  return `[${item.seq}] ${item.from.name}: ${item.text}`
}

export function cursorLine(cursor: number, json: boolean): string {
  return json ? JSON.stringify({ cursor }) : `-- next: --after ${cursor}`
}

/**
 * The whole of one `wait` or `tail` round: items, then the cursor.
 *
 * There is always exactly one cursor line, including on a timeout with nothing
 * new, where it repeats the cursor that went in — so there is always exactly
 * one line to carry forward. It is last, and it is generated here rather than
 * copied from any item, so a message whose own text spells a cursor line
 * cannot be mistaken for the real one: the real one is the line after it.
 */
export function renderRound(items: Item[], cursor: number, options: { json?: boolean } = {}): string {
  const json = options.json ?? false
  const lines = items.map((item) => (json ? JSON.stringify(item) : renderItem(item)))
  lines.push(cursorLine(cursor, json))
  return lines.join('\n') + '\n'
}
