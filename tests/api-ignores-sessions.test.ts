import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRedis } from './fake-redis'
import type { WaveRedis } from '@/lib/redis'

/**
 * The API stays bearer-only (AUTH.md 2.4, 3.7): no channel route reads a
 * session, as a cookie or as a bearer. Two checks. Statically, nothing under
 * app/api/v1 or in lib/auth.ts imports the accounts module. Behaviourally, a
 * session presented to every channel route is treated as no credential: the
 * cookie is never read, and the bearer is compared against channel tokens
 * like any other string and fails.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

let redis: WaveRedis

vi.mock('@/lib/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redis')>()),
  getRedis: async () => redis,
}))

describe('channel routes never read a session', () => {
  beforeEach(() => {
    redis = fakeRedis().redis
  })

  it('nothing under app/api/v1 or lib/auth.ts imports lib/accounts', () => {
    const files = [...walk('app/api/v1'), 'lib/auth.ts', 'lib/channels.ts', 'lib/participants.ts', 'lib/messages.ts']
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/lib\/accounts|better-auth/)
    }
  })

  it('a session cookie and a session bearer are refused on every route that takes a token', async () => {
    const { POST: createRoute } = await import('@/app/api/v1/channels/route')
    const routes = {
      read: (await import('@/app/api/v1/channels/[id]/route')).GET,
      head: (await import('@/app/api/v1/channels/[id]/head/route')).GET,
      join: (await import('@/app/api/v1/channels/[id]/join/route')).POST,
      poll: (await import('@/app/api/v1/channels/[id]/messages/route')).GET,
      post: (await import('@/app/api/v1/channels/[id]/messages/route')).POST,
      leave: (await import('@/app/api/v1/channels/[id]/leave/route')).POST,
      close: (await import('@/app/api/v1/channels/[id]/close/route')).POST,
    }
    const origin = 'https://wave.example.com'
    const created = await createRoute(
      new Request(`${origin}/api/v1/channels`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'sessions', ttl: '1h' }),
      }),
    )
    expect(created.status).toBe(201)
    const { channel_id: id } = (await created.json()) as { channel_id: string }
    const sessionToken = 'a'.repeat(32)
    const headers = {
      cookie: `wave.session_token=${sessionToken}.signature`,
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json',
    }
    const context = { params: Promise.resolve({ id }) }
    for (const [name, route] of Object.entries(routes)) {
      const method = ['read', 'head', 'poll'].includes(name) ? 'GET' : 'POST'
      const response = await route(
        new Request(`${origin}/api/v1/channels/${id}`, {
          method,
          headers,
          body: method === 'POST' ? JSON.stringify({ name: 'x', text: 'x' }) : undefined,
        }),
        context,
      )
      expect(response.status, name).toBe(401)
    }
  })
})
