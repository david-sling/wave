import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit.js'
import { run } from '../src/index.js'
import { FileError, fileError } from '../src/io.js'
import { encodeSession } from '../src/session.js'
import { apiError, harness, json } from './support.js'

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

describe('join -s with a file it cannot write', () => {
  it('fails before anyone joins', async () => {
    const test = harness({ handler: () => json(joined) })
    test.io.writeFile = async (path) => {
      throw new FileError(`Cannot write ${path}: the directory it would go in does not exist.`)
    }

    expect(await run(['join', LINK, '--name', 'Mac agent', '-s', FILE], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain(`Cannot write ${FILE}: the directory it would go in does not exist.`)
    expect(test.calls).toHaveLength(0)
  })

  it('hands back the session and the undo when the write fails after the join', async () => {
    const test = harness({ handler: () => json(joined) })
    let writes = 0
    test.io.writeFile = async (path) => {
      writes += 1
      if (writes > 1) throw new FileError(`Cannot write ${path}: the disk is full.`)
    }

    expect(await run(['join', LINK, '--name', 'Mac agent', '-s', FILE], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('Joined, but Cannot write')
    expect(test.errors()).toMatch(/--session: wv1\./)
    expect(test.errors()).toMatch(/wave leave --session wv1\./)
  })

  it('removes the placeholder when the join itself fails', async () => {
    const test = harness({ handler: () => apiError(409, 'channel_full', 'This channel is full (10 participants).') })

    expect(await run(['join', LINK, '--name', 'Mac agent', '-s', FILE], test.io)).toBe(EXIT.channelFull)
    expect(test.files.has(FILE)).toBe(false)
  })
})

describe('join with an invite the channel refuses', () => {
  it('is a mistake in the URL, not a channel that has gone', async () => {
    const test = harness({ handler: () => apiError(401, 'unauthorized', 'Invalid invite token for this channel.') })

    expect(await run(['join', LINK, '--name', 'Mac agent'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('everything after the # in the channel URL')
    expect(test.errors()).not.toContain('Usage:')
  })

  it('still means gone on any other command', async () => {
    const test = harness({
      handler: () => apiError(401, 'unauthorized', 'Invalid or missing token for this channel.'),
      files: { [FILE]: SESSION },
    })

    expect(await run(['who', '-s', FILE], test.io)).toBe(EXIT.gone)
  })
})

describe('an instance that cannot be reached', () => {
  it('names the host and the cause, and what to check', async () => {
    const test = harness({ files: { [FILE]: SESSION } })
    test.io.fetch = async () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) })
    }

    expect(await run(['who', '-s', FILE], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('Could not reach https://wave.example.com: connection refused')
    expect(test.errors()).toContain('Check the host in the channel URL')
    expect(test.errors()).not.toContain('fetch failed')
  })

  it('says when the host answered but is not a Wave instance', async () => {
    const test = harness({ handler: () => new Response('<html>', { status: 200 }), files: { [FILE]: SESSION } })

    expect(await run(['who', '-s', FILE], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('https://wave.example.com answered with something that is not JSON')
  })
})

describe('file errors', () => {
  it.each([
    ['EACCES', 'permission denied'],
    ['ENOENT', 'the directory it would go in does not exist'],
    ['EISDIR', 'that is a directory'],
  ])('says %s in words', (code, words) => {
    const error = fileError('write', FILE, Object.assign(new Error(`${code}: raw`), { code }))
    expect(error.message).toBe(`Cannot write ${FILE}: ${words}.`)
  })
})

describe('usage errors', () => {
  it('end with the usage of the command that was run', async () => {
    const test = harness()

    expect(await run(['join', LINK], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toBe(
      'wave: --name is required.\nUsage: wave join <channel-url> --name <name> [--client <product>] [-s <file>]\n',
    )
  })

  it('list the options a command takes when given one it does not', async () => {
    const test = harness()

    expect(await run(['send', '-s', FILE, '--nmae', 'x', 'hi'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain(
      'No such option: --nmae. It takes --session, -s/--session-file, --file, --reply-to, --done.',
    )
    expect(test.errors()).toContain('Usage: wave send')
  })
})
