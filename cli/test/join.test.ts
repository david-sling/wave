import { describe, expect, it } from 'vitest'
import { UsageError } from '../src/args.js'
import { detectClient, parseChannelLink } from '../src/commands/join.js'
import { EXIT } from '../src/exit.js'
import { run } from '../src/index.js'
import { decodeSession } from '../src/session.js'
import { apiError, harness, json, sentBody } from './support.js'

const LINK = 'https://wave.example.com/c/-j7yRyQ2#8vUyR0nnLmR2QoQ9vG1z'

const joined = {
  participant_id: 'p_9f3',
  participant_token: 'tok_abcdefghijklmnopqrstuvwxyz',
  name: 'Mac agent',
  channel: { name: 'Build debugging', mode: 'standard', expires_at: '2026-09-18T00:00:00Z', max_participants: 10 },
  participants: [
    { id: 'p_9f3', name: 'Mac agent', role: 'agent', presence: 'active', client: 'claude-code' },
    { id: 'p_1aa', name: 'Windows agent', role: 'agent', presence: 'idle' },
  ],
  last_seq: 7,
}

describe('parseChannelLink', () => {
  it('takes host, channel and invite out of one URL', () => {
    expect(parseChannelLink(LINK)).toEqual({
      host: 'https://wave.example.com',
      channelId: '-j7yRyQ2',
      invite: '8vUyR0nnLmR2QoQ9vG1z',
    })
  })

  it('keeps a port, and tolerates a trailing slash on the channel path', () => {
    expect(parseChannelLink('http://localhost:3000/c/abc/#inv')).toEqual({
      host: 'http://localhost:3000',
      channelId: 'abc',
      invite: 'inv',
    })
  })

  it('reads the e2ee key out of the fragment', () => {
    expect(parseChannelLink(`${LINK}.aKeyInBase64Url`)).toMatchObject({ key: 'aKeyInBase64Url' })
  })

  it('says what is missing, one message per way of being wrong', () => {
    expect(() => parseChannelLink('wave.example.com/c/abc#inv')).toThrow(/Not a channel URL/)
    expect(() => parseChannelLink('https://wave.example.com/abc#inv')).toThrow(/no channel in it/)
    // The fragment is the capability, and a link copied from an address bar
    // that dropped it looks complete.
    expect(() => parseChannelLink('https://wave.example.com/c/abc')).toThrow(/no invite after the #/)
    expect(() => parseChannelLink('https://wave.example.com/c/abc#')).toThrow(/no invite after the #/)
    expect(() => parseChannelLink('https://wave.example.com/c/abc#a.b.c')).toThrow(UsageError)
  })
})

describe('detectClient', () => {
  it('reads the one environment mark it knows, and invents nothing', () => {
    expect(detectClient({ CLAUDECODE: '1' })).toBe('claude-code')
    expect(detectClient({ TERM_PROGRAM: 'iTerm.app' })).toBeUndefined()
  })
})

describe('wave join', () => {
  it('joins, and prints the roster, the session and the cursor', async () => {
    const test = harness({ handler: () => json(joined) })

    expect(await run(['join', LINK, '--name', 'Mac agent', '--client', 'claude-code'], test.io)).toBe(EXIT.ok)

    const lines = test.text().trimEnd().split('\n')
    expect(lines[0]).toBe('Joined "Build debugging" as "Mac agent".')
    expect(lines[1]).toBe('Mac agent (you) - active - claude-code')
    expect(lines[2]).toBe('Windows agent - idle')
    // The last two lines are the two things every later command needs back,
    // and the cursor is last, exactly as it is after every wait.
    expect(lines.at(-1)).toBe('-- next: --after 7')
    expect(lines.at(-2)).toMatch(/^-- session: wv1\./)
  })

  it('puts host, channel, participant and token into the session string, and nothing else', async () => {
    const test = harness({ handler: () => json(joined) })
    await run(['join', LINK, '--name', 'Mac agent'], test.io)

    const printed = /-- session: (\S+)/.exec(test.text())?.[1]
    expect(decodeSession(printed!)).toEqual({
      host: 'https://wave.example.com',
      channel_id: '-j7yRyQ2',
      participant_id: 'p_9f3',
      token: 'tok_abcdefghijklmnopqrstuvwxyz',
    })
  })

  it('sends the invite as the bearer, and the name and role in the body', async () => {
    const test = harness({ handler: () => json(joined) })
    await run(['join', LINK, '--name', 'Mac agent', '--client', 'codex-cli'], test.io)

    const [call] = test.calls
    expect(call!.url.href).toBe('https://wave.example.com/api/v1/channels/-j7yRyQ2/join')
    expect((call!.init!.headers as Record<string, string>).authorization).toBe('Bearer 8vUyR0nnLmR2QoQ9vG1z')
    expect(sentBody(call!.init)).toEqual({ name: 'Mac agent', role: 'agent', client: 'codex-cli' })
  })

  it('fills the client from the environment when the flag is absent, and omits it when there is nothing to fill', async () => {
    const marked = harness({ handler: () => json(joined), env: { CLAUDECODE: '1' } })
    await run(['join', LINK, '--name', 'Mac agent'], marked.io)
    expect(sentBody(marked.calls[0]!.init)).toMatchObject({ client: 'claude-code' })

    const bare = harness({ handler: () => json(joined) })
    await run(['join', LINK, '--name', 'Mac agent'], bare.io)
    expect(sentBody(bare.calls[0]!.init)).not.toHaveProperty('client')
  })

  it('exits 4 when the channel is full, and 5 when it is gone', async () => {
    const full = harness({ handler: () => apiError(409, 'channel_full', 'This channel is full (10 participants).') })
    expect(await run(['join', LINK, '--name', 'Mac agent'], full.io)).toBe(EXIT.channelFull)
    expect(full.errors()).toContain('This channel is full')

    const gone = harness({ handler: () => apiError(410, 'gone', 'This channel has expired or been closed.') })
    expect(await run(['join', LINK, '--name', 'Mac agent'], gone.io)).toBe(EXIT.gone)
  })

  it('refuses a key in a standard channel, and says how to undo the join', async () => {
    const test = harness({ handler: () => json(joined) })

    expect(await run(['join', `${LINK}.aKey`, '--name', 'Mac agent'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('would go as plaintext')
    expect(test.errors()).toContain('wave leave --session wv1.')
    expect(test.text()).toBe('')
  })

  it('refuses an e2ee channel joined without a key', async () => {
    const test = harness({ handler: () => json({ ...joined, channel: { ...joined.channel, mode: 'e2ee' } }) })

    expect(await run(['join', LINK, '--name', 'Mac agent'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('end-to-end encrypted')
    expect(test.text()).toBe('')
  })

  it('needs a name, one URL, and a URL at all', async () => {
    const test = harness({ handler: () => json(joined) })

    expect(await run(['join', LINK], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('--name is required')
    expect(await run(['join'], test.io)).toBe(EXIT.failed)
    expect(await run(['join', LINK, LINK, '--name', 'x'], test.io)).toBe(EXIT.failed)
    expect(await run(['join', LINK, '--name', 'x', '--nmae', 'y'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('No such option: --nmae')
    expect(test.calls).toHaveLength(0)
  })
})
