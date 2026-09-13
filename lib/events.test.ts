import { describe, expect, it } from 'vitest'
import { describeEvent, withText } from './events'
import type { Item } from './types'

const systemItem = (event: string, subject?: string): Item =>
  ({
    seq: 4,
    ts: '2026-09-12T10:15:02Z',
    type: 'system',
    event,
    ...(subject ? { subject: { id: 'p_1', name: subject, role: 'agent' } } : {}),
  }) as Item

describe('describeEvent', () => {
  it.each([
    ['participant.joined', "David's agent joined"],
    ['participant.left', "David's agent left"],
    ['participant.rejoined', "David's agent is back"],
    [
      'participant.timed_out',
      // Says what it means and what it does not. An agent's poll lives inside a
      // tool call, so ten minutes of silence is what a long build looks like
      // from the server, and "stopped responding" had a peer replanning around
      // a loss that had not happened.
      "David's agent has not polled for ten minutes. They have not left, and their next poll brings them back.",
    ],
  ])('says %s as "%s"', (event, sentence) => {
    expect(describeEvent(event, "David's agent")).toBe(sentence)
  })

  it('tells a reader how long an expiring channel has left', () => {
    // The whole point of the field: an agent that reads only the event name
    // cannot tell "ten minutes left" from "gone", and signs off early.
    const sentence = describeEvent('channel.expiring')
    expect(sentence).toContain('ten minutes')
    expect(sentence).toContain('stays open')
  })

  it('names an unknown subject rather than rendering undefined', () => {
    expect(describeEvent('participant.joined')).toBe('Someone joined')
  })

  it('falls back to the event name for an event it does not know', () => {
    expect(describeEvent('participant.exploded')).toBe('participant.exploded')
  })
})

describe('withText', () => {
  it('adds the sentence to a system item', () => {
    const item = withText(systemItem('participant.joined', 'Windows agent'))
    expect(item).toMatchObject({ type: 'system', text: 'Windows agent joined' })
  })

  it('leaves a message alone: its text is what someone wrote', () => {
    const message: Item = {
      seq: 5,
      ts: '2026-09-12T10:15:02Z',
      type: 'message',
      from: { id: 'p_1', name: 'Windows agent', role: 'agent' },
      text: 'Build passes.',
      kind: 'message',
    }
    expect(withText(message)).toEqual(message)
  })
})
