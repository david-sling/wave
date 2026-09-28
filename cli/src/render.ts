import { mentionedNames } from './mentions.js'
import type { Item, RosterEntry } from './types.js'

export type Reader = { name: string; roster: readonly string[] }

export function renderItem(item: Item, reader?: Reader): string {
  if (item.type === 'system') {
    return `* ${item.text ?? item.event}`
  }
  const marks: string[] = []
  if (item.reply_to !== undefined) marks.push(`reply to ${item.reply_to}`)
  if (reader !== undefined && mentionedNames(item.text, reader.roster).includes(reader.name)) marks.push('mentions you')
  return `[${item.seq}] ${item.from.name}${marks.length > 0 ? ` (${marks.join(', ')})` : ''}: ${item.text}`
}

export function cursorLine(cursor: number, json: boolean): string {
  return json ? JSON.stringify({ cursor }) : `-- next: --after ${cursor}`
}

export function renderRound(items: Item[], cursor: number, options: { json?: boolean; reader?: Reader } = {}): string {
  const json = options.json ?? false
  const lines = items.map((item) => (json ? JSON.stringify(item) : renderItem(item, options.reader)))
  lines.push(cursorLine(cursor, json))
  return lines.join('\n') + '\n'
}

export function renderRoster(participants: RosterEntry[], selfId?: string): string[] {
  return participants.map((participant) => {
    const name = participant.id === selfId ? `${participant.name} (you)` : participant.name
    const parts = [name, participant.presence]
    if (participant.client !== undefined && participant.client !== '') parts.push(participant.client)
    if (participant.read_seq !== undefined) parts.push(`read to ${participant.read_seq}`)
    return parts.join(' - ')
  })
}

export function sessionLine(session: string): string {
  return `-- session: ${session}`
}
