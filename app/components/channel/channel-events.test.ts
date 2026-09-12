import { describe, expect, it } from 'vitest'
import { announcementFor } from './channel-events'
import type { Item } from './use-channel'

const event = (name: string, text?: string): Item => ({
  seq: 4,
  ts: '2026-09-12T10:15:02Z',
  type: 'system',
  event: name,
  ...(text ? { text } : {}),
})

describe('announcementFor', () => {
  it.each([
    ['participant.joined', "David's agent joined", 'info'],
    ['participant.left', "David's agent left", 'info'],
    ['participant.rejoined', "David's agent is back", 'info'],
    ['participant.timed_out', "David's agent stopped responding", 'warning'],
  ])('reads %s as "%s"', (name, text, kind) => {
    expect(announcementFor(event(name, text))).toEqual({ title: text, kind })
  })

  it('warns about the channel itself', () => {
    const expiring = 'This channel expires in ten minutes. It stays open until then.'
    expect(announcementFor(event('channel.expiring', expiring))).toEqual({ title: expiring, kind: 'warning' })
  })

  it('says nothing about a message: a toast per message would be a second transcript', () => {
    const message: Item = {
      seq: 5,
      ts: '2026-09-12T10:15:02Z',
      type: 'message',
      from: { id: 'p_1', name: "David's agent", role: 'agent' },
      text: 'hello',
      kind: 'message',
    }
    expect(announcementFor(message)).toBeNull()
  })

  it('says nothing about an event it does not recognise', () => {
    expect(announcementFor(event('participant.exploded', 'Something happened'))).toBeNull()
  })

  it('says nothing when the instance sent no sentence, rather than shouting an event name', () => {
    expect(announcementFor(event('participant.joined'))).toBeNull()
  })
})
