import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VERSION } from '../src/version.js'

describe('VERSION', () => {
  it('is the version this package publishes as', () => {
    // The constant exists because the CLI reads no files, not even its own
    // manifest. A release identifying itself as the one before it would be
    // invisible in every log it appears in, so the two are pinned together.
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

    expect(VERSION).toBe(manifest.version)
  })
})
