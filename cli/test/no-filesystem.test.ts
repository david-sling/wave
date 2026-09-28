import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The CLI keeps no state of its own: no session store, no cursor file, no
 * config, no `~/.wave`. It touches a file only at a path the caller named on
 * the command line, which is what lets two agents in the same channel on the
 * same machine stay two agents — they share a file only by being told the
 * same one.
 *
 * That property is invisible in any single file and easy to lose later, so it
 * is asserted here over the whole of `src/` rather than trusted to review:
 * `io.ts` is the one module that may reach the filesystem, and nothing
 * anywhere may go looking for a home directory.
 */

const src = fileURLToPath(new URL('../src', import.meta.url))
const io = join(src, 'io.ts')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

const fsImport = [
  /from\s+['"](node:)?fs(\/promises)?['"]/,
  /require\(\s*['"](node:)?fs(\/promises)?['"]/,
  /import\(\s*['"](node:)?fs(\/promises)?['"]/,
]

describe('the CLI', () => {
  it('has sources to check, and io.ts among them', () => {
    expect(sources(src)).toContain(io)
  })

  it.each(sources(src).filter((path) => path !== io))('reaches no file except through Io: %s', (path) => {
    const code = readFileSync(path, 'utf8')
    for (const pattern of fsImport) expect(code).not.toMatch(pattern)
  })

  it.each(sources(src))('has no path of its own: %s', (path) => {
    const code = readFileSync(path, 'utf8')
    // A home or temp directory is only ever wanted here to put something in it.
    expect(code).not.toMatch(/homedir\(|tmpdir\(|XDG_|APPDATA/)
  })

  it('writes session files readable by their owner only', () => {
    expect(readFileSync(io, 'utf8')).toContain('mode: 0o600')
  })
})
