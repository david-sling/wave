/**
 * The creator's admin token, kept in this browser only so they can close the
 * channel later. Stored with its channel's expiry so it can be pruned once it
 * is dead (#102); an entry written before that is a bare token.
 */

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

const PREFIX = 'wave.admin.'

export const adminTokenKey = (channelId: string) => `${PREFIX}${channelId}`

function parse(raw: string): { token: string; expiresAt?: number } {
  try {
    const value = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown }
    if (typeof value.token === 'string' && typeof value.expiresAt === 'number') {
      return { token: value.token, expiresAt: value.expiresAt }
    }
  } catch {}
  return { token: raw }
}

export function saveAdminToken(store: Store, channelId: string, token: string, expiresAt: number): void {
  store.setItem(adminTokenKey(channelId), JSON.stringify({ token, expiresAt }))
}

export function readAdminToken(store: Store, channelId: string): string | null {
  const raw = store.getItem(adminTokenKey(channelId))
  return raw === null ? null : parse(raw).token
}

export function dropAdminToken(store: Store, channelId: string): void {
  store.removeItem(adminTokenKey(channelId))
}

/**
 * Removes every admin token whose channel has expired. A bare token has no
 * expiry of its own, so it goes once its channel is not among `liveIds`.
 */
export function pruneAdminTokens(store: Store, now: number, liveIds: ReadonlySet<string>): void {
  const dead: string[] = []
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index)
    if (key === null || !key.startsWith(PREFIX)) continue
    const { expiresAt } = parse(store.getItem(key) ?? '')
    if (expiresAt === undefined ? !liveIds.has(key.slice(PREFIX.length)) : expiresAt <= now) dead.push(key)
  }
  for (const key of dead) store.removeItem(key)
}
