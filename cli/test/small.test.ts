import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit.js'
import { run } from '../src/index.js'
import { encodeSession } from '../src/session.js'
import { apiError, harness, json } from './support.js'

const SESSION = encodeSession({
  host: 'https://wave.example.com',
  channel_id: '-j7yRyQ2',
  participant_id: 'p_9f3',
  token: 'tok_abcdefghijklmnopqrstuvwxyz',
})

const view = {
  channel: {
    id: '-j7yRyQ2',
    name: 'Build debugging',
    mode: 'standard',
    created_at: '2026-09-11T10:00:00Z',
    expires_at: '2026-09-12T10:00:00Z',
    max_participants: 10,
  },
  participants: [
    { id: 'p_9f3', name: 'Mac agent', role: 'agent', presence: 'active', client: 'claude-code' },
    { id: 'p_1aa', name: 'Windows agent', role: 'agent', presence: 'idle' },
    { id: 'p_2bb', name: 'David', role: 'human', presence: 'gone', client: 'browser' },
  ],
  last_seq: 9,
}

describe('wave leave', () => {
  it('leaves, and says the session string is finished', async () => {
    const test = harness({ handler: () => json({ left: true, participant_id: 'p_9f3' }) })

    expect(await run(['leave', '--session', SESSION], test.io)).toBe(EXIT.ok)
    expect(test.calls[0]!.url.href).toBe('https://wave.example.com/api/v1/channels/-j7yRyQ2/leave')
    expect(test.calls[0]!.init!.method).toBe('POST')
    expect(test.text()).toContain('Left the channel.')
  })

  it('exits 5 rather than erroring when the channel is already gone', async () => {
    const test = harness({ handler: () => apiError(410, 'gone', 'This channel has expired or been closed.') })

    expect(await run(['leave', '--session', SESSION], test.io)).toBe(EXIT.gone)
    expect(test.errors()).toContain('expired or been closed')
  })

  it('exits 5 when this participant has already left, which is the same story', async () => {
    const test = harness({ handler: () => apiError(401, 'unauthorized', 'Invalid or missing token for this channel.') })

    expect(await run(['leave', '--session', SESSION], test.io)).toBe(EXIT.gone)
  })
})

describe('wave who', () => {
  it('renders presence and client for everyone, and no gap where a client is missing', async () => {
    const test = harness({ handler: () => json(view) })

    expect(await run(['who', '--session', SESSION], test.io)).toBe(EXIT.ok)
    expect(test.text()).toBe(
      ['Mac agent (you) - active - claude-code', 'Windows agent - idle', 'David - gone - browser', ''].join('\n'),
    )
  })

  it('prints the client exactly as reported, without folding it onto a product', async () => {
    // The server decides what `claude-opus-5` counts as. Deciding it here as
    // well is how the two come to disagree.
    const test = harness({
      handler: () =>
        json({
          ...view,
          participants: [{ id: 'p_1aa', name: 'Windows agent', role: 'agent', presence: 'active', client: 'claude-opus-5' }],
        }),
    })

    await run(['who', '--session', SESSION], test.io)
    expect(test.text()).toBe('Windows agent - active - claude-opus-5\n')
  })

  it('reads the channel over the participant token', async () => {
    const test = harness({ handler: () => json(view) })
    await run(['who', '--session', SESSION], test.io)

    expect(test.calls[0]!.url.href).toBe('https://wave.example.com/api/v1/channels/-j7yRyQ2')
    expect((test.calls[0]!.init!.headers as Record<string, string>).authorization).toBe(
      'Bearer tok_abcdefghijklmnopqrstuvwxyz',
    )
  })

  it('needs a session like every other command', async () => {
    const test = harness({ handler: () => json(view) })

    expect(await run(['who'], test.io)).toBe(EXIT.failed)
    expect(await run(['leave'], test.io)).toBe(EXIT.failed)
    expect(test.calls).toHaveLength(0)
  })
})
