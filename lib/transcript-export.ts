import type { Item, RosterEntry } from '@/app/components/channel/use-channel'

/**
 * The transcript, as a file (PRODUCT section 10).
 *
 * A channel is deliberately short-lived, so the only durable record is the one
 * someone takes before it expires. These build it from what the page has
 * already seen: no request is made, nothing is sent anywhere, and in `e2ee`
 * mode the text written out is the text the browser decrypted — the server
 * could not produce this file itself.
 *
 * Both formats carry the same items. JSON is for a machine and keeps every
 * field; Markdown is for a person and reads as a conversation. Events are kept
 * in both, because "the other agent left" is often the explanation for why a
 * conversation stops.
 */

export type TranscriptSource = {
  channel: { id: string; name: string; mode: string; created_at: string; expires_at: string }
  items: Item[]
  participants: RosterEntry[]
  /** When the file was made. Passed in so the output is deterministic under test. */
  exportedAt: string
}

/** `wave-orders-api-2026-09-12.md`, or the channel ID when the channel has no name. */
export function transcriptFilename(
  channel: { id: string; name: string },
  format: 'json' | 'md',
  exportedAt: string,
): string {
  const slug =
    channel.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || channel.id
  return `wave-${slug}-${exportedAt.slice(0, 10)}.${format}`
}

/**
 * Everything the page holds, with the shape it arrived in. The envelope names
 * the channel and when the file was taken, so a transcript found later is
 * still self-describing.
 */
export function toJson(source: TranscriptSource): string {
  return `${JSON.stringify(
    {
      channel: source.channel,
      exported_at: source.exportedAt,
      participants: source.participants.map(({ id, name, role, client }) => ({ id, name, role, client })),
      items: source.items,
    },
    null,
    2,
  )}\n`
}

/**
 * The clock the reader was watching: their own zone and their own locale's
 * 12- or 24-hour convention. Deliberately the same call the transcript makes
 * in channel-view, so the file reads like the page it came from.
 */
function clock(ts: string): string {
  const at = new Date(ts)
  if (Number.isNaN(at.getTime())) return ts
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Indents every line after the first so a multi-line message stays inside its
 * own bullet. Code blocks are common in these channels and a stray dedent
 * turns one into a new list item.
 */
function indent(text: string): string {
  return text.split('\n').join('\n  ')
}

export function toMarkdown(source: TranscriptSource): string {
  const { channel, items, participants, exportedAt } = source
  const title = channel.name.trim() || `Channel ${channel.id}`
  const lines: string[] = [`# ${title}`, '']

  lines.push(
    `Exported ${exportedAt} from a Wave channel${channel.mode === 'e2ee' ? ', decrypted in the browser' : ''}.`,
    `Opened ${channel.created_at} · expires ${channel.expires_at}`,
    '',
  )

  if (participants.length > 0) {
    lines.push('## In the channel', '')
    for (const person of participants) {
      const client = person.client ? ` — ${person.client}` : ''
      lines.push(`- **${person.name}** (${person.role})${client}`)
    }
    lines.push('')
  }

  lines.push('## Transcript', '')

  if (items.length === 0) {
    lines.push('_Nothing was said in this channel._')
    return `${lines.join('\n')}\n`
  }

  for (const item of items) {
    if (item.type === 'system') {
      // The server writes the sentence; fall back to the raw event name so an
      // event this build does not know about still appears rather than vanishing.
      lines.push(`- _${item.text ?? item.event}_ · ${clock(item.ts)}`)
      continue
    }
    const done = item.kind === 'done' ? ' · done' : ''
    const reply = item.reply_to === undefined ? '' : ` · replying to #${item.reply_to}`
    lines.push(`- **${item.from.name}** · ${clock(item.ts)}${done}${reply}`, `  ${indent(item.text)}`)
  }

  return `${lines.join('\n')}\n`
}
