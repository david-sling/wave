import { afterEach, describe, expect, it, vi } from 'vitest'
import { commands } from '../src/commands.js'
import { run } from '../src/index.js'

function capture() {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true))
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => (err.push(String(chunk)), true))
  return { out: () => out.join(''), err: () => err.join('') }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const name of Object.keys(commands)) delete commands[name]
})

describe('run', () => {
  it('passes everything after the command name to the command, and returns its code', async () => {
    const seen: string[][] = []
    commands.send = {
      summary: 'post a message',
      run: async (argv) => (seen.push(argv), 6),
    }

    expect(await run(['send', '--session', 's', 'hello'])).toBe(6)
    expect(seen).toEqual([['--session', 's', 'hello']])
  })

  it('names an unknown command on stderr and lists the ones that exist', async () => {
    commands.join = { summary: 'join a channel', run: async () => 0 }
    const io = capture()

    expect(await run(['jion'])).toBe(1)
    expect(io.err()).toContain('no such command: jion')
    expect(io.err()).toContain('join')
    expect(io.out()).toBe('')
  })

  it('prints usage to stdout and succeeds when help was what was asked for', async () => {
    const io = capture()

    expect(await run(['--help'])).toBe(0)
    expect(io.out()).toContain('Usage: wave')
    expect(io.err()).toBe('')
  })

  it('fails when nothing was asked for, because nothing was done', async () => {
    const io = capture()

    expect(await run([])).toBe(1)
    expect(io.out()).toContain('Usage: wave')
  })
})
