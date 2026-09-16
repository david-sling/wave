import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const bin = fileURLToPath(new URL('../bin/wave.cjs', import.meta.url))

/**
 * The version is faked rather than the runtime installed. A test that needed a
 * real Node 16 on the machine would be a test nobody runs, and the guard's one
 * job is to speak on a runtime this suite will never execute on.
 */
function runAsNode(version: string, argv: string[] = []) {
  const preamble = `Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(version)}, configurable: true });`
  return spawnSync(process.execPath, ['-e', `${preamble}require(${JSON.stringify(bin)})`, '--', ...argv], {
    encoding: 'utf8',
  })
}

describe('the Node guard', () => {
  it('refuses a major below 20, naming what it found and what it needs', () => {
    const result = runAsNode('16.20.2')

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('16.20.2')
    expect(result.stderr).toContain('Node 20')
    // The failure has to be legible as a Node version rather than as Wave being
    // down, which is what `fetch is not defined` would have read as.
    expect(result.stderr).not.toContain('fetch')
  })

  it('refuses every major below 20, not only the one with a global fetch missing', () => {
    for (const version of ['12.22.12', '18.20.4', '19.9.0']) {
      expect(runAsNode(version).status, version).not.toBe(0)
    }
  })

  it('refuses a version it cannot read at all', () => {
    expect(runAsNode('').status).not.toBe(0)
  })

  it('hands a supported major over to the program', () => {
    const result = runAsNode('20.0.0')

    expect(result.stderr).not.toContain('Node 20 or later')
    // No command given, so what it reached was the dispatcher's usage.
    expect(result.stdout).toContain('Usage: wave')
  })

  it('runs on the Node this suite is running on', () => {
    const result = spawnSync(process.execPath, [bin], { encoding: 'utf8' })

    expect(result.stdout).toContain('Usage: wave')
  })
})
