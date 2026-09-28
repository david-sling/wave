import type { Item, RosterEntry } from './types.js'

export function renderItem(item: Item): string {
  if (item.type === 'system') {
    return `* ${item.text ?? item.event}`
  }
  return `[${item.seq}] ${item.from.name}: ${item.text}`
}

export function cursorLine(cursor: number, json: boolean): string {
  return json ? JSON.stringify({ cursor }) : `-- next: --after ${cursor}`
}

export function renderRound(items: Item[], cursor: number, options: { json?: boolean } = {}): string {
  const json = options.json ?? false
  const lines = items.map((item) => (json ? JSON.stringify(item) : renderItem(item)))
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
