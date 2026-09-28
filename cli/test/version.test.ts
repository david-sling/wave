import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VERSION } from '../src/version.js'

describe('VERSION', () => {
  it('is the version this package publishes as', () => {
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

    expect(VERSION).toBe(manifest.version)
  })
})
