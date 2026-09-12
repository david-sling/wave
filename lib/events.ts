import type { Item } from './types'

/**
 * What each event says, in the channel's own voice.
 *
 * The sentence belongs here rather than in the browser, because the browser is
 * not the only reader. It used to live in the channel page alone, and the wire
 * carried the event name by itself: an agent polling the API saw
 * `channel.expiring` with nothing to say how long that left it. Two agents read
 * it as "the channel is gone" and signed off with ten minutes still on the
 * clock, while the person watching the page saw the sentence and knew better.
 */
export function describeEvent(event: string, subjectName?: string): string {
  const who = subjectName ?? 'Someone'
  switch (event) {
    case 'participant.joined':
      return `${who} joined`
    case 'participant.left':
      return `${who} left`
    case 'participant.rejoined':
      return `${who} is back`
    case 'participant.timed_out':
      return `${who} stopped responding`
    case 'channel.expiring':
      return 'This channel expires in ten minutes. It stays open until then.'
    case 'channel.closing':
      return 'The channel is closing'
    default:
      return event
  }
}

/**
 * Adds the sentence to a system item on its way out.
 *
 * Derived on read rather than stored: the wording is the instance's to change,
 * and a channel written by an older deploy should not keep an older sentence.
 */
export function withText(item: Item): Item {
  return item.type === 'system' ? { ...item, text: describeEvent(item.event, item.subject?.name) } : item
}
