import { describe, expect, it } from 'vitest'
import type { Participant } from '@/app/components/transcript'
import { seatingOf } from './seating'

const agent = (name: string, client: string): Participant => ({
  name,
  role: 'agent',
  client,
  presence: 'active',
})

const human = (name: string): Participant => ({
  name,
  role: 'human',
  client: 'human',
  presence: 'active',
})

describe('seatingOf', () => {
  it('lets a lone agent on a known client be its mark', () => {
    const seat = seatingOf([agent('Maya’s agent', 'Claude Code'), agent('Ravi’s agent', 'Codex CLI')])
    expect(seat('Maya’s agent')).toMatchObject({ shared: false, soloMark: true })
    expect(seat('Ravi’s agent')).toMatchObject({ shared: false, soloMark: true })
  })

  it('takes the mark off both tiles once two agents share a client', () => {
    const seat = seatingOf([agent('Maya’s agent', 'Claude Code'), agent('Ravi’s agent', 'Claude Code')])
    expect(seat('Maya’s agent')).toMatchObject({ shared: true, soloMark: false })
    expect(seat('Ravi’s agent')).toMatchObject({ shared: true, soloMark: false })
  })

  it('never gives a mark to a client that has none, however alone it is', () => {
    const seat = seatingOf([agent('Sam’s agent', 'some shell loop')])
    expect(seat('Sam’s agent')).toMatchObject({ shared: false, soloMark: false })
  })

  it('counts by mark, so one tool spelled two ways is still one tool', () => {
    // The client is free text an agent reports about itself. Counting strings
    // would put two identical Claude starbursts in this room.
    const seat = seatingOf([agent('Maya’s agent', 'Claude Code'), agent('Ravi’s agent', '  claude-code  ')])
    expect(seat('Maya’s agent')).toMatchObject({ shared: true, soloMark: false })
    expect(seat('Ravi’s agent')).toMatchObject({ shared: true, soloMark: false })
  })

  it('does not make two unmarked agents share anything, since nothing is drawn', () => {
    const seat = seatingOf([agent('Sam’s agent', 'shell loop'), agent('Kit’s agent', 'shell loop')])
    expect(seat('Sam’s agent')).toMatchObject({ shared: false, soloMark: false })
  })

  it('does not count humans as sharing a client with each other', () => {
    const seat = seatingOf([human('Maya'), human('Ravi')])
    expect(seat('Maya')).toMatchObject({ shared: false, soloMark: false })
  })

  it('never gives a human a mark, whatever their client says', () => {
    const seat = seatingOf([human('Maya'), agent('Maya’s agent', 'Claude Code')])
    expect(seat('Maya').soloMark).toBe(false)
  })

  it('reports a plain seat for a name that is not in the room', () => {
    const seat = seatingOf([agent('Maya’s agent', 'Claude Code')])
    expect(seat('Someone who left')).toMatchObject({ shared: false, soloMark: false })
  })
})
