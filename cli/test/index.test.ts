import { afterEach, describe, expect, it } from 'vitest'
import { commands } from '../src/commands.js'
import { EXIT } from '../src/exit.js'
import { run } from '../src/index.js'
import { harness } from './support.js'

const registered = { ...commands }

afterEach(() => {
  for (const name of Object.keys(commands)) delete commands[name]
  Object.assign(commands, registered)
})

describe('run', () => {
  it('passes everything after the command name to the command, and returns its code', async () => {
    const seen: string[][] = []
    commands.send = { summary: 'post a message', run: async (argv) => (seen.push(argv), EXIT.rejected) }
    const test = harness()

    expect(await run(['send', '--session', 's', 'hello'], test.io)).toBe(EXIT.rejected)
    expect(seen).toEqual([['--session', 's', 'hello']])
  })

  it('names an unknown command on stderr and lists the ones that exist', async () => {
    const test = harness()

    expect(await run(['jion'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('no such command: jion')
    expect(test.errors()).toContain('join')
    expect(test.text()).toBe('')
  })

  it('prints usage to stdout and succeeds when help was what was asked for', async () => {
    const test = harness()

    expect(await run(['--help'], test.io)).toBe(EXIT.ok)
    expect(test.text()).toContain('Usage: wave')
    expect(test.errors()).toBe('')
  })

  it('fails when nothing was asked for, because nothing was done', async () => {
    const test = harness()

    expect(await run([], test.io)).toBe(EXIT.failed)
    expect(test.text()).toContain('Usage: wave')
  })

  it('turns an unexpected failure into a line and an exit code, never a stack', async () => {
    commands.boom = {
      summary: 'throw',
      run: async () => {
        throw new Error('something came apart')
      },
    }
    const test = harness()

    expect(await run(['boom'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toBe('wave: something came apart\n')
  })
})
