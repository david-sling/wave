import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeRedis } from './fake-redis'
import type { WaveRedis } from '@/lib/redis'
import { run } from '../cli/src/index'
import type { Io } from '../cli/src/io'

let redis: WaveRedis

vi.mock('@/lib/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redis')>()),
  getRedis: async () => redis,
}))

const { POST: createRoute } = await import('@/app/api/v1/channels/route')
const { GET: readRoute } = await import('@/app/api/v1/channels/[id]/route')
const { POST: joinRoute } = await import('@/app/api/v1/channels/[id]/join/route')
const { POST: leaveRoute } = await import('@/app/api/v1/channels/[id]/leave/route')
const { GET: pollRoute, POST: postRoute } = await import('@/app/api/v1/channels/[id]/messages/route')

const ORIGIN = 'https://wave.example.com'

const route: Io['fetch'] = async (input, init) => {
  const request = new Request(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init)
  const { pathname } = new URL(request.url)
  const match = /^\/api\/v1\/channels\/([^/]+)(\/join|\/leave|\/messages)?$/.exec(pathname)
  if (!match) throw new Error(`no route for ${pathname}`)

  const context = { params: Promise.resolve({ id: decodeURIComponent(match[1]!) }) }
  switch (match[2]) {
    case '/join':
      return joinRoute(request, context)
    case '/leave':
      return leaveRoute(request, context)
    case '/messages':
      return request.method === 'POST' ? postRoute(request, context) : pollRoute(request, context)
    default:
      return readRoute(request, context)
  }
}

let disk: Map<string, string>

function harness(env: Record<string, string | undefined> = {}) {
  const out: string[] = []
  const err: string[] = []
  const io: Io = {
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    env,
    stdin: async () => '',
    sleep: async () => {},
    now: () => Date.now(),
    fetch: route,
    readFile: async (path) => disk.get(path),
    writeFile: async (path, text) => void disk.set(path, text),
    removeFile: async (path) => void disk.delete(path),
  }
  return { io, text: () => out.join(''), errors: () => err.join('') }
}

async function createChannel(body: unknown = { ttl: '1h', name: 'Build debugging' }) {
  const response = await createRoute(
    new Request(`${ORIGIN}/api/v1/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return (await response.json()) as { channel_id: string; invite_token: string }
}

const link = (channel: { channel_id: string; invite_token: string }) =>
  `${ORIGIN}/c/${channel.channel_id}#${channel.invite_token}`

async function join(channel: { channel_id: string; invite_token: string }, name: string) {
  const test = harness()
  const code = await run(['join', link(channel), '--name', name, '--client', 'claude-code'], test.io)
  const session = /-- session: (\S+)/.exec(test.text())?.[1]
  return { code, session: session!, text: test.text(), errors: test.errors() }
}

beforeEach(() => {
  disk = new Map()
  ;({ redis } = fakeRedis())
})

describe('wave join, against the real routes', () => {
  it('joins a real channel and prints a session its own commands can use', async () => {
    const channel = await createChannel()
    const first = await join(channel, 'Mac agent')

    expect(first.code).toBe(0)
    expect(first.text).toContain('Joined "Build debugging" as "Mac agent".')
    expect(first.session).toMatch(/^wv1\./)
    expect(first.text).toContain('-- next: --after 1')
  })

  it('gives two agents in one channel two sessions, which is the whole point of holding no files', async () => {
    const channel = await createChannel()
    const mac = await join(channel, 'Mac agent')
    const windows = await join(channel, 'Windows agent')

    expect(mac.session).not.toBe(windows.session)
    expect(windows.text).toContain('Mac agent')
    expect(windows.text).toContain('Windows agent (you)')
  })

  it('refuses the invite a channel does not have', async () => {
    const channel = await createChannel()
    const test = harness()

    const code = await run(['join', `${ORIGIN}/c/${channel.channel_id}#wrong`, '--name', 'Mac agent'], test.io)

    expect(code).toBe(1)
    expect(test.errors()).toMatch(/token/i)
    expect(test.errors()).toContain('Copy the whole URL again')
  })
})

describe('wave send, against the real routes', () => {
  it('posts, and the seq it reports is the one the channel stored', async () => {
    const channel = await createChannel()
    const mac = await join(channel, 'Mac agent')
    const test = harness()

    expect(await run(['send', '--session', mac.session, 'Build passes.'], test.io)).toBe(0)
    expect(test.text()).toMatch(/^-- sent: seq \d+ \(where it landed, not a cursor\)\n$/)

    const stored = await pollRoute(
      new Request(`${ORIGIN}/api/v1/channels/${channel.channel_id}/messages?after=0&wait=0`, {
        headers: { authorization: `Bearer ${channel.invite_token}` },
      }),
      { params: Promise.resolve({ id: channel.channel_id }) },
    )
    const body = (await stored.json()) as { items: Array<{ seq: number; text?: string }> }
    const seq = Number(/seq (\d+)/.exec(test.text())![1])
    expect(body.items.find((item) => item.seq === seq)?.text).toBe('Build passes.')
  })

  it('is refused by the real secret filter with exit 6, not by a rule of its own', async () => {
    const channel = await createChannel()
    const mac = await join(channel, 'Mac agent')
    const test = harness()

    const code = await run(['send', '--session', mac.session, 'the key is AKIAIOSFODNN7EXAMPLE, use it'], test.io)

    expect(code).toBe(6)
    expect(test.errors()).toMatch(/Nothing was posted/)
  })
})

describe('wave wait, against the real routes', () => {
  const now = (session: string, after: number, io: Io) =>
    run(['wait', '--session', session, '--after', String(after), '--timeout', '0'], io)

  it('shows one agent what another said, and hands back a cursor that is past it', async () => {
    const channel = await createChannel()
    const mac = await join(channel, 'Mac agent')
    const windows = await join(channel, 'Windows agent')
    await run(['send', '--session', windows.session, 'Build passes.'], harness().io)

    const heard = harness()
    expect(await now(mac.session, cursorOf(mac.text), heard.io)).toBe(0)
    expect(heard.text()).toContain('[3] Windows agent: Build passes.')
    expect(heard.text()).toContain('* Windows agent joined')

    const again = harness()
    expect(await now(mac.session, cursorOf(heard.text()), again.io)).toBe(2)
    expect(again.text()).toBe(`-- next: --after ${cursorOf(heard.text())}\n`)
  })

  it('does not hand an agent back its own message', async () => {
    const channel = await createChannel()
    const mac = await join(channel, 'Mac agent')
    await run(['send', '--session', mac.session, 'Anyone there?'], harness().io)

    const heard = harness()
    expect(await now(mac.session, cursorOf(mac.text), heard.io)).toBe(2)
    expect(heard.text()).not.toContain('Anyone there?')
    expect(cursorOf(heard.text())).toBeGreaterThan(cursorOf(mac.text))
  })
})

describe('wave leave and wave who, against the real routes', () => {
  it('shows the room as the API reports it, this agent marked', async () => {
    const channel = await createChannel()
    const mac = await join(channel, 'Mac agent')
    await join(channel, 'Windows agent')
    const test = harness()

    expect(await run(['who', '--session', mac.session], test.io)).toBe(0)
    expect(test.text()).toBe('Mac agent (you) - active - claude-code\nWindows agent - active - claude-code\n')
  })

  it('leaves, and the session string stops working everywhere at once', async () => {
    const channel = await createChannel()
    const mac = await join(channel, 'Mac agent')

    expect(await run(['leave', '--session', mac.session], harness().io)).toBe(0)

    for (const argv of [['who'], ['send', '-'], ['wait', '--timeout', '0'], ['leave']]) {
      const after = harness()
      expect(await run([...argv, '--session', mac.session], { ...after.io, stdin: async () => 'hello' }), argv[0]).toBe(
        5,
      )
    }
  })
})

describe("the join prompt's path: -s <file> on every command, against the real routes", () => {
  it('takes two agents in one channel from join to leave with nothing but wave and a file each', async () => {
    const channel = await createChannel()
    const mac = '/tmp/wave-test-mac-agent'
    const windows = '/tmp/wave-test-windows-agent'

    const joinMac = harness()
    expect(await run(['join', link(channel), '--name', 'Mac agent', '-s', mac], joinMac.io)).toBe(0)
    expect(await run(['join', link(channel), '--name', 'Windows agent', '-s', windows], harness().io)).toBe(0)
    expect(joinMac.text()).not.toContain('wv1.')
    expect(disk.get(mac)).not.toBe(disk.get(windows))

    expect(await run(['send', '-s', windows, 'Build passes.'], harness().io)).toBe(0)
    const heard = harness()
    expect(
      await run(['wait', '-s', mac, '--after', String(cursorOf(joinMac.text())), '--timeout', '0'], heard.io),
    ).toBe(0)
    expect(heard.text()).toContain('Windows agent: Build passes.')

    expect(await run(['leave', '-s', mac], harness().io)).toBe(0)
    expect(disk.has(mac)).toBe(false)
    expect(disk.has(windows)).toBe(true)
  })

  it('refuses a second join into the same file, and the channel sees one participant', async () => {
    const channel = await createChannel()
    const file = '/tmp/wave-test-mac-agent'
    await run(['join', link(channel), '--name', 'Mac agent', '-s', file], harness().io)

    const twice = harness()
    expect(await run(['join', link(channel), '--name', 'Mac agent', '-s', file], twice.io)).toBe(1)
    expect(twice.errors()).toContain('already holds a session')

    const room = harness()
    await run(['who', '-s', file], room.io)
    expect(room.text().match(/Mac agent/g)).toHaveLength(1)
  })
})

function cursorOf(text: string): number {
  return Number(/-- next: --after (\d+)/.exec(text)![1])
}
