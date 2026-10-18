import { describe, expect, it } from 'vitest'
import { adminTokenKey, dropAdminToken, pruneAdminTokens, readAdminToken, saveAdminToken } from './admin-tokens'

function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    key: (index) => [...store.keys()][index] ?? null,
    clear: () => store.clear(),
    get length() {
      return store.size
    },
  }
}

const now = Date.parse('2026-10-18T12:00:00Z')

describe('admin tokens', () => {
  it('read back the token, whether stored with its expiry or bare', () => {
    const storage = memoryStorage()
    saveAdminToken(storage, 'a', 'adm-a', now + 1)
    storage.setItem(adminTokenKey('legacy'), 'adm-legacy')
    expect(readAdminToken(storage, 'a')).toBe('adm-a')
    expect(readAdminToken(storage, 'legacy')).toBe('adm-legacy')
    expect(readAdminToken(storage, 'none')).toBeNull()
  })

  it('drop one on request', () => {
    const storage = memoryStorage()
    saveAdminToken(storage, 'a', 'adm-a', now + 1)
    dropAdminToken(storage, 'a')
    expect(readAdminToken(storage, 'a')).toBeNull()
  })

  it('prune the expired, bare ones whose channel is gone, and nothing else', () => {
    const storage = memoryStorage()
    saveAdminToken(storage, 'expired', 't', now)
    saveAdminToken(storage, 'alive', 't', now + 1)
    storage.setItem(adminTokenKey('bare-live'), 't')
    storage.setItem(adminTokenKey('bare-gone'), 't')
    storage.setItem('wave.channels', '[]')

    pruneAdminTokens(storage, now, new Set(['bare-live']))

    expect(readAdminToken(storage, 'expired')).toBeNull()
    expect(readAdminToken(storage, 'bare-gone')).toBeNull()
    expect(readAdminToken(storage, 'alive')).toBe('t')
    expect(readAdminToken(storage, 'bare-live')).toBe('t')
    expect(storage.getItem('wave.channels')).toBe('[]')
  })
})
