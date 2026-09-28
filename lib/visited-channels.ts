export type VisitedChannel = {
  id: string
  invite: string
  name: string
  /** Epoch ms. The entry dies with the room. */
  expiresAt: number
  /** Epoch ms. Decides which entry the cap drops. */
  lastSeenAt: number
  /** Epoch ms, when this browser first opened the room. */
  addedAt: number
  /** Epoch ms of the latest message any tab has seen here; 0 for none yet. */
  lastMessageAt: number
}

type Entry = Omit<VisitedChannel, 'lastSeenAt' | 'addedAt' | 'lastMessageAt'> &
  Partial<Pick<VisitedChannel, 'addedAt' | 'lastMessageAt'>>

export const VISITED_KEY = 'wave.channels'
export const VISITED_CAP = 20

export function live(list: VisitedChannel[], now: number): VisitedChannel[] {
  return list.filter((entry) => entry.expiresAt > now)
}

export function record(list: VisitedChannel[], entry: Entry, now: number): VisitedChannel[] {
  const existing = list.find((other) => other.id === entry.id)
  const rest = list.filter((other) => other.id !== entry.id)
  const next: VisitedChannel = {
    ...entry,
    lastSeenAt: now,
    addedAt: existing?.addedAt ?? entry.addedAt ?? now,
    lastMessageAt: Math.max(existing?.lastMessageAt ?? 0, entry.lastMessageAt ?? 0),
  }
  return live([next, ...rest], now)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, VISITED_CAP)
}

/** Returns the same list when nothing moved, so a caller can skip the write. */
export function noteMessage(list: VisitedChannel[], id: string, at: number): VisitedChannel[] {
  const entry = list.find((other) => other.id === id)
  if (!entry || at <= entry.lastMessageAt) return list
  return list.map((other) => (other.id === id ? { ...other, lastMessageAt: at } : other))
}

/** Most recent activity first: the latest message, or the opening for a room nobody has spoken in. */
export function byActivity(list: VisitedChannel[]): VisitedChannel[] {
  const activity = (entry: VisitedChannel) => Math.max(entry.lastMessageAt, entry.addedAt)
  return [...list].sort((a, b) => activity(b) - activity(a))
}

export function forget(list: VisitedChannel[], id: string): VisitedChannel[] {
  return list.filter((entry) => entry.id !== id)
}

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const time = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function entryFrom(value: unknown): VisitedChannel | null {
  if (typeof value !== 'object' || value === null) return null
  const { id, invite, name, expiresAt, lastSeenAt, addedAt, lastMessageAt } = value as Record<string, unknown>
  if (!text(id) || !text(invite) || !time(expiresAt) || !time(lastSeenAt)) return null
  return {
    id,
    invite,
    name: typeof name === 'string' ? name : '',
    expiresAt,
    lastSeenAt,
    addedAt: time(addedAt) ? addedAt : lastSeenAt,
    lastMessageAt: time(lastMessageAt) ? lastMessageAt : 0,
  }
}

export function parse(raw: string | null): VisitedChannel[] {
  if (raw === null) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const list: VisitedChannel[] = []
  for (const item of value) {
    const entry = entryFrom(item)
    if (entry === null || seen.has(entry.id)) continue
    seen.add(entry.id)
    list.push(entry)
  }
  return list
}

export function readVisited(): VisitedChannel[] {
  try {
    return parse(window.localStorage.getItem(VISITED_KEY))
  } catch {
    return []
  }
}

export function writeVisited(list: VisitedChannel[]): void {
  try {
    window.localStorage.setItem(VISITED_KEY, JSON.stringify(list))
  } catch {
    // Private browsing: the list simply does not persist.
  }
}
