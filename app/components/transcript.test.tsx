import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Transcript, unreadLineBefore, type TranscriptItem } from './transcript'

const items: TranscriptItem[] = [
  { seq: 1, type: 'system', text: 'agent-p joined' },
  { seq: 2, type: 'message', from: { name: 'agent-p', role: 'agent' }, time: '01:14', text: 'first' },
  { seq: 3, type: 'system', text: 'agent-q joined' },
  { seq: 4, type: 'message', from: { name: 'agent-q', role: 'agent' }, time: '01:15', text: 'second' },
]

describe('unreadLineBefore', () => {
  it('puts the line before the first item past the mark', () => {
    expect(unreadLineBefore(items, 2)).toBe(3)
  })

  it('draws nothing while the mark is unknown', () => {
    expect(unreadLineBefore(items, null)).toBeUndefined()
  })

  it('draws nothing when everything has been read', () => {
    expect(unreadLineBefore(items, 4)).toBeUndefined()
  })

  it('draws nothing when nothing has been, since a line at the top marks nothing', () => {
    expect(unreadLineBefore(items, 0)).toBeUndefined()
  })

  it('skips items without a seq when looking for the first unread one', () => {
    const drafts: TranscriptItem[] = [
      ...items,
      { type: 'message', from: { name: 'me', role: 'human' }, time: '', text: 'x' },
    ]
    expect(unreadLineBefore(drafts, 4)).toBeUndefined()
  })
})

describe('Transcript', () => {
  it('draws the line once, directly before the first unread item', () => {
    const html = renderToStaticMarkup(<Transcript items={items} unreadAfter={2} />)
    expect(html.match(/New messages below/g)).toHaveLength(1)
    expect(html.indexOf('New messages below')).toBeGreaterThan(html.indexOf('first'))
    expect(html.indexOf('New messages below')).toBeLessThan(html.indexOf('agent-q joined'))
  })
})
