import { describe, expect, it } from 'vitest'
import { HUE_BUCKETS, hashSeed, identityColor, identityHue, identityPalette } from './identity-color'

describe('identityColor', () => {
  it('gives the same participant the same colour every time', () => {
    expect(identityColor('Windows agent', 'agent')).toEqual(identityColor('Windows agent', 'agent'))
  })

  it('survives a rejoin: the seed is the name, not a fresh participant ID', () => {
    const before = identityColor("David's agent", 'agent')
    const after = identityColor("David's agent", 'agent')
    expect(after).toEqual(before)
  })

  it('ignores case and surrounding space, as name deduplication does', () => {
    expect(identityColor('  Windows Agent  ', 'agent')).toEqual(identityColor('windows agent', 'agent'))
  })

  it('lands on one of the twelve buckets, never between them', () => {
    for (let i = 0; i < 50; i += 1) {
      const hue = identityHue(`agent ${i}:agent`)
      expect(hue % (360 / HUE_BUCKETS)).toBe(0)
    }
  })

  it('seeds a person and their agent separately, even under one name', () => {
    // Twelve buckets means two seeds can still land together; identityPalette is
    // what guarantees separation once they are in a room together.
    expect(hashSeed('david:human')).not.toBe(hashSeed('david:agent'))
  })

  it('stays in the palette register: only the hue moves', () => {
    for (const name of ['a', 'bb', 'Windows agent', "David's agent (2)", '🌊 agent']) {
      const { fill, ink } = identityColor(name, 'agent')
      expect(fill).toMatch(/^hsl\((\d{1,3}) 84% 92%\)$/)
      expect(ink).toMatch(/^hsl\((\d{1,3}) 46% 30%\)$/)
      expect(Number(fill.match(/\d{1,3}/)![0])).toBe(Number(ink.match(/\d{1,3}/)![0]))
    }
  })

  it('spreads hues across the wheel rather than clumping', () => {
    const hues = Array.from({ length: 60 }, (_, i) => identityHue(`agent ${i}:agent`))
    const quadrants = new Set(hues.map((hue) => Math.floor(hue / 90)))
    expect(quadrants.size).toBe(4)
  })
})

describe('identityPalette', () => {
  const roster = (...names: string[]) => names.map((name) => ({ name, role: 'agent' }))

  it('separates a person from their agent when both are present', () => {
    const colorFor = identityPalette([
      { name: 'David', role: 'human' },
      { name: 'David', role: 'agent' },
    ])
    expect(colorFor('David', 'human')).not.toEqual(colorFor('David', 'agent'))
  })

  it('gives no two participants the same colour', () => {
    // These two hash to the same bucket, which is what the palette exists to resolve.
    const people = roster('Mac agent', 'Release bot', "David's agent", 'Windows agent', "Priya's agent")
    const colorFor = identityPalette(people)
    const fills = people.map((p) => colorFor(p.name, p.role).fill)
    expect(new Set(fills).size).toBe(people.length)
  })

  it('keeps a participant on their preferred bucket when nobody else wants it', () => {
    const colorFor = identityPalette(roster('Windows agent'))
    expect(colorFor('Windows agent', 'agent')).toEqual(identityColor('Windows agent', 'agent'))
  })

  it('does not recolour the people already in the room when someone joins', () => {
    const before = identityPalette(roster('Mac agent', 'Release bot'))
    const after = identityPalette(roster('Mac agent', 'Release bot', 'Late arrival'))
    expect(after('Mac agent', 'agent')).toEqual(before('Mac agent', 'agent'))
    expect(after('Release bot', 'agent')).toEqual(before('Release bot', 'agent'))
  })

  it('still answers for a name that has left the roster', () => {
    const colorFor = identityPalette(roster('Windows agent'))
    expect(colorFor('Departed agent', 'agent')).toEqual(identityColor('Departed agent', 'agent'))
  })

  it('survives a channel larger than the palette', () => {
    const crowd = roster(...Array.from({ length: 50 }, (_, i) => `agent ${i}`))
    const colorFor = identityPalette(crowd)
    const fills = crowd.map((p) => colorFor(p.name, p.role).fill)
    expect(new Set(fills).size).toBe(HUE_BUCKETS)
    expect(fills.every((fill) => /^hsl\(\d{1,3} 84% 92%\)$/.test(fill))).toBe(true)
  })

  it('hashes deterministically and stays a 32-bit unsigned integer', () => {
    const hash = hashSeed('windows agent:agent')
    expect(hash).toBe(hashSeed('windows agent:agent'))
    expect(Number.isInteger(hash)).toBe(true)
    expect(hash).toBeGreaterThanOrEqual(0)
    expect(hash).toBeLessThanOrEqual(0xffffffff)
  })
})
