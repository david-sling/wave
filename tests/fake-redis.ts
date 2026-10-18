import { RESERVE_ITEM_SCRIPT } from '@/lib/items'
import { JOIN_SCRIPT } from '@/lib/participants'
import { CHANNEL_TTL_SCRIPT, type WaveRedis } from '@/lib/redis'

/**
 * An in-memory stand-in for the Redis commands this app uses: strings,
 * hashes, sets, sorted sets, TTLs, MULTI, and SCAN. Enough to exercise the
 * storage logic in unit tests; the real thing is exercised by the integration
 * test against a live Redis (#26).
 */

type Entry = { value: string | Map<string, string> | Set<string> | Map<string, number>; expireAt?: number }

export class FakeRedis {
  private readonly store = new Map<string, Entry>()

  /** Test seam: what the store holds right now, for assertions about deletion. */
  keys(): string[] {
    return [...this.store.keys()].sort()
  }

  ttlOf(key: string): number | undefined {
    return this.store.get(key)?.expireAt
  }

  private entry(key: string, make: () => Entry['value']): Entry {
    let found = this.store.get(key)
    if (!found) {
      found = { value: make() }
      this.store.set(key, found)
    }
    return found
  }

  async hSet(key: string, fields: Record<string, string>): Promise<number> {
    const hash = this.entry(key, () => new Map<string, string>()).value as Map<string, string>
    for (const [field, value] of Object.entries(fields)) hash.set(field, value)
    return Object.keys(fields).length
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    const hash = this.store.get(key)?.value
    return hash instanceof Map ? Object.fromEntries(hash as Map<string, string>) : {}
  }

  async hGet(key: string, field: string): Promise<string | null> {
    const hash = this.store.get(key)?.value
    return hash instanceof Map ? ((hash as Map<string, string>).get(field) ?? null) : null
  }

  async hVals(key: string): Promise<string[]> {
    const hash = this.store.get(key)?.value
    return hash instanceof Map ? [...(hash as Map<string, string>).values()] : []
  }

  async hDel(key: string, field: string): Promise<number> {
    const hash = this.store.get(key)?.value
    return hash instanceof Map && hash.delete(field) ? 1 : 0
  }

  async get(key: string): Promise<string | null> {
    const value = this.store.get(key)?.value
    return typeof value === 'string' ? value : null
  }

  async set(key: string, value: string, options?: { expiration?: { type: 'EX'; value: number } }): Promise<string> {
    const ttl = options?.expiration?.value
    this.store.set(key, {
      value,
      expireAt: ttl === undefined ? this.store.get(key)?.expireAt : Math.floor(Date.now() / 1000) + ttl,
    })
    return 'OK'
  }

  async incr(key: string): Promise<number> {
    return this.incrBy(key, 1)
  }

  async decr(key: string): Promise<number> {
    return this.incrBy(key, -1)
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return this.expireAt(key, Math.floor(Date.now() / 1000) + seconds)
  }

  async ttl(key: string): Promise<number> {
    const expireAt = this.store.get(key)?.expireAt
    if (expireAt === undefined) return this.store.has(key) ? -1 : -2
    return Math.max(0, expireAt - Math.floor(Date.now() / 1000))
  }

  async incrBy(key: string, by: number): Promise<number> {
    const current = Number((await this.get(key)) ?? 0)
    const next = current + by
    await this.set(key, String(next))
    return next
  }

  async sAdd(key: string, member: string): Promise<number> {
    const set = this.entry(key, () => new Set<string>()).value as Set<string>
    const had = set.has(member)
    set.add(member)
    return had ? 0 : 1
  }

  async sIsMember(key: string, member: string): Promise<boolean> {
    const set = this.store.get(key)?.value
    return set instanceof Set && set.has(member)
  }

  async sRem(key: string, member: string): Promise<number> {
    const set = this.store.get(key)?.value
    return set instanceof Set && set.delete(member) ? 1 : 0
  }

  async zAdd(key: string, member: { score: number; value: string }): Promise<number> {
    const sorted = this.entry(key, () => new Map<string, number>()).value as Map<string, number>
    const had = sorted.has(member.value)
    sorted.set(member.value, member.score)
    return had ? 0 : 1
  }

  async zCard(key: string): Promise<number> {
    const sorted = this.store.get(key)?.value
    return sorted instanceof Map ? sorted.size : 0
  }

  async zRem(key: string, member: string): Promise<number> {
    const sorted = this.store.get(key)?.value
    return sorted instanceof Map && sorted.delete(member) ? 1 : 0
  }

  /** Members with score in [min, max], in score order. */
  async zRangeByScore(key: string, min: number, max: number): Promise<string[]> {
    const sorted = this.store.get(key)?.value
    if (!(sorted instanceof Map)) return []
    return [...(sorted as Map<string, number>).entries()]
      .filter(([, score]) => score >= min && score <= max)
      .sort((a, b) => a[1] - b[1])
      .map(([value]) => value)
  }

  async del(keys: string | string[]): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys]
    return list.filter((key) => this.store.delete(key)).length
  }

  async expireAt(key: string, at: number): Promise<boolean> {
    const entry = this.store.get(key)
    if (!entry) return false
    entry.expireAt = at
    return true
  }

  /**
   * Runs the scripts this app has, and refuses any other: a fake that quietly
   * returned nothing would let a suite pass on work the store never did. Each
   * runs without an await before its writes, so it is atomic as Redis is.
   */
  async eval(script: string, options?: { keys?: string[]; arguments?: string[] }): Promise<unknown> {
    const keys = options?.keys ?? []
    const args = options?.arguments ?? []
    const number = (key: string) => Number(this.store.get(key)?.value ?? 0)
    const write = (key: string, value: number) =>
      this.store.set(key, { value: String(value), expireAt: this.store.get(key)?.expireAt })

    if (script === CHANNEL_TTL_SCRIPT) {
      for (const key of keys) await this.expireAt(key, Number(args[0]))
      return null
    }
    if (script === RESERVE_ITEM_SCRIPT) {
      const [seqKey, bytesKey] = keys as [string, string]
      if (number(seqKey) >= Number(args[0])) return -1
      if (number(bytesKey) + Number(args[2]) > Number(args[1])) return -2
      write(bytesKey, number(bytesKey) + Number(args[2]))
      write(seqKey, number(seqKey) + 1)
      return number(seqKey)
    }
    if (script === JOIN_SCRIPT) {
      const [partsKey, namesKey] = keys as [string, string]
      const parts = this.entry(partsKey, () => new Map<string, string>()).value as Map<string, string>
      const present = [...parts.values()].filter((raw) => JSON.parse(raw).left_at == null).length
      if (present >= Number(args[0])) return 0
      const names = this.entry(namesKey, () => new Set<string>()).value as Set<string>
      if (names.has(args[3]!)) return -1
      names.add(args[3]!)
      parts.set(args[1]!, args[2]!)
      return 1
    }
    throw new Error(`fake-redis: no such script`)
  }

  /** Queues commands and runs them in order on exec, like MULTI/EXEC. */
  multi(): { exec: () => Promise<unknown[]> } & Record<string, (...args: never[]) => unknown> {
    const queued: Array<() => Promise<unknown>> = []
    const proxy = new Proxy(
      {},
      {
        get: (_target, property: string) => {
          if (property === 'exec') {
            return async () => {
              const results: unknown[] = []
              for (const run of queued) results.push(await run())
              return results
            }
          }
          return (...args: unknown[]) => {
            const command = this[property as keyof FakeRedis] as (...inner: unknown[]) => Promise<unknown>
            queued.push(() => command.apply(this, args))
            return proxy
          }
        },
      },
    )
    return proxy as ReturnType<FakeRedis['multi']>
  }

  async *scanIterator({ MATCH }: { MATCH: string; COUNT?: number }): AsyncGenerator<string[]> {
    const prefix = MATCH.endsWith('*') ? MATCH.slice(0, -1) : MATCH
    const matched = [...this.store.keys()].filter((key) =>
      MATCH.endsWith('*') ? key.startsWith(prefix) : key === MATCH,
    )
    // One batch is enough: callers must handle batches, not a specific batch size.
    if (matched.length > 0) yield matched
  }

  async close(): Promise<void> {}
}

/** The fake, typed as the client the app expects. */
export function fakeRedis(): { fake: FakeRedis; redis: WaveRedis } {
  const fake = new FakeRedis()
  return { fake, redis: fake as unknown as WaveRedis }
}
