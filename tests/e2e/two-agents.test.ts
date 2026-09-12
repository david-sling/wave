import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Two scripted agents through the public API (#41).
 *
 * Everything here goes over HTTP to a running instance — no mocks, no route
 * imports, no fake Redis. The client below does exactly what the join prompt
 * in PRODUCT section 7 tells an agent to do, in the same order and with the
 * same cursor arithmetic, so a change that breaks a real agent breaks this
 * first.
 *
 * Not part of `npm test`: it needs a deployment and it spends real seconds
 * waiting on long-polls. Run it against a preview before a release:
 *
 *   WAVE_E2E_URL=https://wave.example.com npm run test:e2e
 *
 * With no URL set it falls back to a local dev server, which needs Redis.
 */

const BASE = (process.env.WAVE_E2E_URL ?? 'http://localhost:3000').replace(/\/$/, '')

type Item = {
  seq: number
  ts: string
  type: 'message' | 'system'
  event?: string
  text?: string
  kind?: string
  from?: { id: string; name: string; role: string }
}

type Poll = { items: Item[]; last_seq: number; participants: { id: string; name: string; presence: string }[] }

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init
  const response = await fetch(`${BASE}/api/v1${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  })
  return response
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`)
  return body as T
}

/**
 * One agent, following the prompt. `lastSeq` advances only from a response
 * actually read, which is the rule the prompt spends a paragraph on: a cursor
 * moved past unread items is how an agent silently drops out of a conversation.
 */
class ScriptedAgent {
  lastSeq = 0
  id = ''
  token = ''
  name = ''

  constructor(private readonly channelId: string) {}

  async join(invite: string, name: string, client: string) {
    const body = await json<{ participant_id: string; participant_token: string; name: string; last_seq?: number }>(
      await api(`/channels/${this.channelId}/join`, {
        method: 'POST',
        token: invite,
        body: JSON.stringify({ name, role: 'agent', client }),
      }),
    )
    this.id = body.participant_id
    this.token = body.participant_token
    this.name = body.name
    this.lastSeq = body.last_seq ?? 0
    return body
  }

  async say(text: string, extra: Record<string, unknown> = {}) {
    return json<{ seq: number; ts: string }>(
      await api(`/channels/${this.channelId}/messages`, {
        method: 'POST',
        token: this.token,
        body: JSON.stringify({ text, ...extra }),
      }),
    )
  }

  /** Step 3 of the prompt, including the cursor rule and skipping one's own items. */
  async poll(wait: number) {
    const body = await json<Poll>(
      await api(`/channels/${this.channelId}/messages?after=${this.lastSeq}&wait=${wait}`, { token: this.token }),
    )
    this.lastSeq = body.last_seq
    return { ...body, fromOthers: body.items.filter((item) => (item.from?.id ?? '') !== this.id) }
  }

  async leave() {
    return api(`/channels/${this.channelId}/leave`, { method: 'POST', token: this.token })
  }
}

let channelId: string
let invite: string
let admin: string

beforeAll(async () => {
  const reachable = await fetch(BASE).catch(() => undefined)
  if (!reachable) throw new Error(`No Wave instance at ${BASE}. Set WAVE_E2E_URL or start the dev server.`)

  const created = await json<{ channel_id: string; invite_token: string; admin_token: string }>(
    await api('/channels', { method: 'POST', body: JSON.stringify({ name: 'e2e two agents', ttl: '1h' }) }),
  )
  channelId = created.channel_id
  invite = created.invite_token
  admin = created.admin_token
}, 30_000)

describe(`two agents through the public API at ${BASE}`, () => {
  it('runs the whole conversation the way the prompt describes it', async () => {
    const alpha = new ScriptedAgent(channelId)
    const beta = new ScriptedAgent(channelId)

    // 1. Join.
    await alpha.join(invite, 'Alpha', 'e2e-script')
    await beta.join(invite, 'Beta', 'e2e-script')
    expect(alpha.id).not.toBe(beta.id)

    // 2. Introduce.
    await alpha.say('Alpha here. Does POST /refunds return the refund or the order?')

    // 3. Beta polls and sees the join events and the question, but not itself.
    const heard = await beta.poll(5)
    expect(heard.fromOthers.some((item) => item.text?.includes('POST /refunds'))).toBe(true)
    expect(heard.items.every((item) => item.from?.id !== beta.id)).toBe(true)
    expect(heard.participants.map((p) => p.name).sort()).toEqual(['Alpha', 'Beta'])

    // 4. Alternate. Each side only ever polls from its own cursor.
    await beta.say('The refund. The order settles a moment later.')
    const back = await alpha.poll(5)
    expect(back.fromOthers.some((item) => item.text?.includes('settles'))).toBe(true)

    // 5. Finish: done, then leave.
    await alpha.say('Understood. Shipping it.', { kind: 'done' })
    await alpha.leave()

    const farewell = await beta.poll(5)
    expect(farewell.items.some((item) => item.kind === 'done')).toBe(true)
    expect(farewell.items.some((item) => item.event === 'participant.left')).toBe(true)

    await beta.say('Noted. Signing off.', { kind: 'done' })
    await beta.leave()
  }, 60_000)

  it('holds an idle long-poll open rather than answering empty at once', async () => {
    const watcher = new ScriptedAgent(channelId)
    await watcher.join(invite, 'Watcher', 'e2e-script')
    await watcher.poll(1) // drain the backlog so the next poll has nothing to say

    const started = Date.now()
    const idle = await watcher.poll(3)
    const held = Date.now() - started

    expect(idle.items).toHaveLength(0)
    // The whole point of `wait`: an agent that got an instant empty answer
    // would spin, and the idle cost measured in #2 would be wrong.
    expect(held).toBeGreaterThan(2_000)
    await watcher.leave()
  }, 30_000)

  it('wakes a waiting agent when someone finally speaks', async () => {
    const waiter = new ScriptedAgent(channelId)
    const talker = new ScriptedAgent(channelId)
    await waiter.join(invite, 'Waiter', 'e2e-script')
    await talker.join(invite, 'Talker', 'e2e-script')
    await waiter.poll(1)

    const started = Date.now()
    const [heard] = await Promise.all([
      waiter.poll(20),
      new Promise((resolve) => setTimeout(resolve, 1_500)).then(() => talker.say('Finally.')),
    ])

    expect(heard.fromOthers.some((item) => item.text === 'Finally.')).toBe(true)
    // Returns on the message, not at the end of the wait window.
    expect(Date.now() - started).toBeLessThan(15_000)
    await waiter.leave()
    await talker.leave()
  }, 40_000)

  it('deduplicates a name that is already taken', async () => {
    const first = new ScriptedAgent(channelId)
    const second = new ScriptedAgent(channelId)
    await first.join(invite, 'Twin', 'e2e-script')
    await second.join(invite, 'Twin', 'e2e-script')

    expect(first.name).toBe('Twin')
    expect(second.name).not.toBe('Twin')
    expect(second.name).toContain('Twin')
    await first.leave()
    await second.leave()
  }, 30_000)

  it('refuses a credential and says what it matched, without echoing it', async () => {
    const agent = new ScriptedAgent(channelId)
    await agent.join(invite, 'Careless', 'e2e-script')

    const secret = 'AKIA4Z9QKJ3MXNPLQR7T'
    const response = await api(`/channels/${channelId}/messages`, {
      method: 'POST',
      token: agent.token,
      body: JSON.stringify({ text: `here: ${secret}` }),
    })

    expect(response.status).toBe(422)
    const body = await response.text()
    expect(body).toContain('AWS access key ID')
    expect(body).not.toContain(secret)
    await agent.leave()
  }, 30_000)

  it('returns the same seq for a retried client_id', async () => {
    const agent = new ScriptedAgent(channelId)
    await agent.join(invite, 'Retrier', 'e2e-script')

    const first = await agent.say('Sent once.', { client_id: 'e2e-retry' })
    const again = await agent.say('Sent once.', { client_id: 'e2e-retry' })
    expect(again.seq).toBe(first.seq)
    await agent.leave()
  }, 30_000)

  it('is gone for everyone once the creator closes it', async () => {
    const closed = await api(`/channels/${channelId}/close`, { method: 'POST', token: admin })
    expect(closed.status).toBe(200)

    const after = await api(`/channels/${channelId}/messages`, { token: invite })
    expect(after.status).toBe(410)
  }, 30_000)
})
