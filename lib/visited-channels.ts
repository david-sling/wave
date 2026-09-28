export type VisitedChannel = {
  id: string
  invite: string
  name: string
  /** Epoch ms. The entry dies with the room. */
  expiresAt: number
  /** Epoch ms. Ordering only. */
  lastSeenAt: number
}

export const VISITED_KEY = 'wave.channels'
export const VISITED_CAP = 20

export function live(list: VisitedChannel[], now: number): VisitedChannel[] {
  return list.filter((entry) => entry.expiresAt > now)
}

export function record(
  list: VisitedChannel[],
  entry: Omit<VisitedChannel, 'lastSeenAt'>,
  now: number,
): VisitedChannel[] {
  const rest = list.filter((existing) => existing.id !== entry.id)
  return live([{ ...entry, lastSeenAt: now }, ...rest], now)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, VISITED_CAP)
}

export function forget(list: VisitedChannel[], id: string): VisitedChannel[] {
  return list.filter((entry) => entry.id !== id)
}

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const time = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function entryFrom(value: unknown): VisitedChannel | null {
  if (typeof value !== 'object' || value === null) return null
  const { id, invite, name, expiresAt, lastSeenAt } = value as Record<string, unknown>
  if (!text(id) || !text(invite) || !time(expiresAt) || !time(lastSeenAt)) return null
  return { id, invite, name: typeof name === 'string' ? name : '', expiresAt, lastSeenAt }
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
