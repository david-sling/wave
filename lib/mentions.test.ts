import { describe, expect, it } from 'vitest'
import { findMentions } from './mentions'

const room = ['David', "David's agent", 'Windows agent']

/** Just the names, in order, which is what every assertion here is actually about. */
function named(text: string, names: readonly string[] = room): string[] {
  return findMentions(text, names).map((mention) => mention.name)
}

describe('findMentions', () => {
  it('finds a name from the room', () => {
    expect(findMentions('ping @David please', room)).toEqual([{ index: 5, length: 6, name: 'David' }])
  })

  it('finds a name with spaces in it, which is most of why the roster is the dictionary', () => {
    expect(named('over to @Windows agent now')).toEqual(['Windows agent'])
  })

  it('takes the longest name that matches, not the first one that starts', () => {
    expect(named("@David's agent, can you look")).toEqual(["David's agent"])
    // And the shorter one still wins where the longer one does not fit.
    expect(named('@David, can you look')).toEqual(['David'])
  })

  it('leaves a name nobody in the room has as plain text', () => {
    expect(named('@Nobody @david-sling @')).toEqual([])
  })

  it('is case-insensitive, and reports the roster spelling', () => {
    expect(named('@david and @WINDOWS AGENT')).toEqual(['David', 'Windows agent'])
  })

  it('will not read an email address as a mention', () => {
    expect(named('david@David.example and x@Windows agent')).toEqual([])
  })

  it('will not match a name that the text runs past', () => {
    expect(named('@Davidson shipped it')).toEqual([])
    // A non-word character is not running past it.
    expect(named('@David, @David. @David!')).toEqual(['David', 'David', 'David'])
  })

  it('finds several without overlapping them', () => {
    const found = findMentions('@David and @Windows agent', room)
    expect(found.map((m) => m.index)).toEqual([0, 11])
    expect(found[0].index + found[0].length).toBeLessThanOrEqual(found[1].index)
  })

  it('finds nothing in an empty room', () => {
    expect(named('@David', [])).toEqual([])
  })
})
