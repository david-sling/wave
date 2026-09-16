import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The CLI writes nothing to disk and reads nothing from disk: no session file,
 * no cursor file, no config, no `~/.wave`. Every invocation is a function of
 * its arguments and one HTTP call, which is what lets two agents in the same
 * channel on the same machine stay two agents.
 *
 * That property is invisible in any single file and easy to lose later, so it
 * is asserted here over the whole of `src/` rather than trusted to review.
 */

const src = fileURLToPath(new URL('../src', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

describe('the CLI', () => {
  it('has sources to check', () => {
    expect(sources(src).length).toBeGreaterThan(0)
  })

  it.each(sources(src))('holds no state on disk: %s', (path) => {
    const code = readFileSync(path, 'utf8')

    expect(code).not.toMatch(/from\s+['"](node:)?fs(\/promises)?['"]/)
    expect(code).not.toMatch(/require\(\s*['"](node:)?fs(\/promises)?['"]/)
    expect(code).not.toMatch(/import\(\s*['"](node:)?fs(\/promises)?['"]/)
    // A home directory is only ever wanted here to put something in it.
    expect(code).not.toMatch(/homedir\(/)
  })
})
