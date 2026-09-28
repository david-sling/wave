import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit.js'
import { run } from '../src/index.js'
import { decodeSession, encodeSession } from '../src/session.js'
import { VERSION } from '../src/version.js'
import { apiError, harness, json, sentBody, type Handler } from './support.js'

const LINK = 'https://wave.example.com/c/-j7yRyQ2#8vUyR0nnLmR2QoQ9vG1z'
const FILE = '/tmp/wave--j7yRyQ2-mac-agent'

const SESSION = encodeSession({
  host: 'https://wave.example.com',
  channel_id: '-j7yRyQ2',
  participant_id: 'p_9f3',
  token: 'tok_abcdefghijklmnopqrstuvwxyz',
})

const joined = {
  participant_id: 'p_9f3',
  participant_token: 'tok_abcdefghijklmnopqrstuvwxyz',
  name: 'Mac agent',
  channel: { name: 'Build debugging', mode: 'standard', expires_at: '2026-09-18T00:00:00Z', max_participants: 10 },
  participants: [{ id: 'p_9f3', name: 'Mac agent', role: 'agent', presence: 'active' }],
  last_seq: 7,
}

const posted: Handler = () => json({ seq: 12, ts: '2026-09-11T10:15:40Z' }, { status: 201 })

function bearer(test: ReturnType<typeof harness>): string | undefined {
  return (test.calls[0]!.init!.headers as Record<string, string>).authorization
}

describe('wave join -s', () => {
  it('saves the session to the file and never prints it, with the cursor still last', async () => {
    const test = harness({ handler: () => json(joined) })

    expect(await run(['join', LINK, '--name', 'Mac agent', '-s', FILE], test.io)).toBe(EXIT.ok)

    expect(decodeSession(test.files.get(FILE)!.trim())).toMatchObject({ participant_id: 'p_9f3' })
    expect(test.text()).not.toContain('wv1.')
    expect(test.text()).not.toContain('tok_')
    const lines = test.text().trimEnd().split('\n')
    expect(lines.at(-2)).toBe(`-- session saved to ${FILE}`)
    expect(lines.at(-1)).toBe('-- next: --after 7')
  })

  it('takes the long spelling too', async () => {
    const test = harness({ handler: () => json(joined) })

    expect(await run(['join', LINK, '--name', 'Mac agent', '--session-file', FILE], test.io)).toBe(EXIT.ok)
    expect(test.files.has(FILE)).toBe(true)
  })

  it('refuses a file that already holds a session, before anyone joins', async () => {
    const test = harness({ handler: () => json(joined), files: { [FILE]: `${SESSION}\n` } })

    expect(await run(['join', LINK, '--name', 'Mac agent', '-s', FILE], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('already holds a session')
    expect(test.errors()).toContain(`wave leave -s ${FILE}`)
    expect(test.calls).toHaveLength(0)
    expect(test.files.get(FILE)).toBe(`${SESSION}\n`)
  })

  it('joins over an empty file, which holds nothing to lose', async () => {
    const test = harness({ handler: () => json(joined), files: { [FILE]: '\n' } })

    expect(await run(['join', LINK, '--name', 'Mac agent', '-s', FILE], test.io)).toBe(EXIT.ok)
    expect(test.files.get(FILE)).toMatch(/^wv1\./)
  })

  it('writes nothing when the join fails', async () => {
    const test = harness({ handler: () => apiError(409, 'channel_full', 'This channel is full (10 participants).') })

    expect(await run(['join', LINK, '--name', 'Mac agent', '-s', FILE], test.io)).toBe(EXIT.channelFull)
    expect(test.files.has(FILE)).toBe(false)
  })

  it('keeps the session in the file on a mode mismatch, so the undo needs no token either', async () => {
    const test = harness({ handler: () => json(joined) })

    expect(await run(['join', `${LINK}.aKey`, '--name', 'Mac agent', '-s', FILE], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain(`wave leave -s ${FILE}`)
    expect(test.errors()).not.toContain('wv1.')
    expect(test.files.has(FILE)).toBe(true)
  })
})

describe('every other command with -s', () => {
  it.each([
    ['send', ['send', '-s', FILE, 'Build passes.'], posted],
    ['wait', ['wait', '-s', FILE, '--after', '7', '--timeout', '0'], () => json({ items: [], last_seq: 7 })],
    ['who', ['who', '-s', FILE], () => json({ participants: [], last_seq: 7 })],
  ] as const)('%s reads the session from the file', async (_name, argv, handler) => {
    const test = harness({ handler, files: { [FILE]: `${SESSION}\n` } })

    await run([...argv], test.io)
    expect(bearer(test)).toBe('Bearer tok_abcdefghijklmnopqrstuvwxyz')
  })

  it('wins over WAVE_SESSION, because it was named on this command', async () => {
    const other = encodeSession({
      host: 'https://wave.example.com',
      channel_id: '-j7yRyQ2',
      participant_id: 'p_x',
      token: 'tok_other',
    })
    const test = harness({ handler: posted, files: { [FILE]: SESSION }, env: { WAVE_SESSION: other } })

    expect(await run(['send', '-s', FILE, 'hi'], test.io)).toBe(EXIT.ok)
    expect(bearer(test)).toBe('Bearer tok_abcdefghijklmnopqrstuvwxyz')
  })

  it('says how the file gets written when there is none, and calls nothing', async () => {
    const test = harness({ handler: posted })

    expect(await run(['send', '-s', FILE, 'hi'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain(`No session in ${FILE}`)
    expect(test.errors()).toContain('wave join')
    expect(test.calls).toHaveLength(0)
  })

  it('refuses -s and --session together rather than choosing one', async () => {
    const test = harness({ handler: posted, files: { [FILE]: SESSION } })

    expect(await run(['send', '-s', FILE, '--session', SESSION, 'hi'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('not both')
    expect(test.calls).toHaveLength(0)
  })
})

describe('wave leave -s', () => {
  it('leaves and deletes the file, which holds a token and nothing else', async () => {
    const test = harness({ handler: () => json({ left: true, participant_id: 'p_9f3' }), files: { [FILE]: SESSION } })

    expect(await run(['leave', '-s', FILE], test.io)).toBe(EXIT.ok)
    expect(test.files.has(FILE)).toBe(false)
    expect(test.text()).toContain(`deleted ${FILE}`)
  })

  it('deletes it too when the session was already dead', async () => {
    const test = harness({
      handler: () => apiError(410, 'gone', 'This channel has expired or been closed.'),
      files: { [FILE]: SESSION },
    })

    expect(await run(['leave', '-s', FILE], test.io)).toBe(EXIT.gone)
    expect(test.files.has(FILE)).toBe(false)
  })

  it('keeps it when the leave did not happen, so it can be tried again', async () => {
    const test = harness({ handler: () => apiError(503, 'unavailable', 'Try again.'), files: { [FILE]: SESSION } })

    expect(await run(['leave', '-s', FILE], test.io)).toBe(EXIT.failed)
    expect(test.files.get(FILE)).toBe(SESSION)
  })
})

describe('wave send --file', () => {
  it('sends the file as the message, whitespace and all but the trailing newline', async () => {
    const diff = '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-  one\n+  two\n'
    const test = harness({ handler: posted, files: { [FILE]: SESSION, '/tmp/msg.txt': diff } })

    expect(await run(['send', '-s', FILE, '--file', '/tmp/msg.txt'], test.io)).toBe(EXIT.ok)
    expect(sentBody(test.calls[0]!.init)).toMatchObject({ text: diff.trimEnd() })
  })

  it('refuses a missing file, an empty one, and a message beside it', async () => {
    const test = harness({ handler: posted, files: { [FILE]: SESSION, '/tmp/empty.txt': '\n' } })

    expect(await run(['send', '-s', FILE, '--file', '/tmp/nope.txt'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('No such file: /tmp/nope.txt')
    expect(await run(['send', '-s', FILE, '--file', '/tmp/empty.txt'], test.io)).toBe(EXIT.failed)
    expect(await run(['send', '-s', FILE, '--file', '/tmp/empty.txt', 'hi'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('not both')
    expect(test.calls).toHaveLength(0)
  })
})

describe('short options', () => {
  it('names an unknown one rather than sending it as the message', async () => {
    const test = harness({ handler: posted, files: { [FILE]: SESSION } })

    expect(await run(['send', '-s', FILE, '-x'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('No such option: -x')
    expect(test.calls).toHaveLength(0)
  })

  it('leaves a lone `-` meaning stdin', async () => {
    const test = harness({ handler: posted, files: { [FILE]: SESSION }, stdin: 'from stdin\n' })

    expect(await run(['send', '-s', FILE, '-'], test.io)).toBe(EXIT.ok)
    expect(sentBody(test.calls[0]!.init)).toMatchObject({ text: 'from stdin' })
  })
})

describe('wave --version', () => {
  it('prints the version and nothing else', async () => {
    const test = harness()

    expect(await run(['--version'], test.io)).toBe(EXIT.ok)
    expect(test.text()).toBe(`${VERSION}\n`)
  })
})
