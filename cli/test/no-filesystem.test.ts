import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

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
    expect(code).not.toMatch(/homedir\(|tmpdir\(|XDG_|APPDATA/)
  })

  it('writes session files readable by their owner only', () => {
    expect(readFileSync(io, 'utf8')).toContain('mode: 0o600')
  })
})
