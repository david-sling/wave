import { describe, expect, it } from 'vitest'
import { findMentions } from '@/lib/mentions'
import { mentionedNames } from '../cli/src/mentions'

const roster = ["David's agent", 'David', 'Mac agent', 'Mac', 'Łukasz', 'david-sling']

const cases = [
  "@David's agent please look",
  '@David, and @Mac agent',
  '@mac AGENT and @MAC',
  'mail me@David',
  '@Mac agent2 is nobody',
  '@david-sling and @David-x',
  '@Łukasz, cześć',
  '@@David',
  'no mentions here',
  '@Nobody at all',
]

describe('the CLI copy of findMentions', () => {
  it.each(cases)('finds the same names as the app in %j', (text) => {
    expect(mentionedNames(text, roster)).toEqual(findMentions(text, roster).map((match) => match.name))
  })
})
