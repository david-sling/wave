import { describe, expect, it } from 'vitest'
import { reconcile, type Item, type PendingMessage } from './use-channel'

const ME = 'p_me'

const draft = (id: string, text: string, seq?: number): PendingMessage => ({
  id,
  text,
  name: 'David',
  ts: '2026-09-12T10:15:02Z',
  ...(seq === undefined ? {} : { seq }),
})

const said = (seq: number, text: string, from = ME): Item => ({
  seq,
  ts: '2026-09-12T10:15:02Z',
  type: 'message',
  from: { id: from, name: from === ME ? 'David' : 'Nova', role: from === ME ? 'human' : 'agent' },
  text,
  kind: 'message',
})

const texts = (queue: PendingMessage[]) => queue.map((entry) => entry.text)

describe('reconcile', () => {
  it('keeps a draft the channel has not answered for yet', () => {
    expect(texts(reconcile([draft('a', 'hello')], [], 4, ME))).toEqual(['hello'])
  })

  it('retires a draft once its own seq has been passed', () => {
    expect(reconcile([draft('a', 'hello', 5)], [said(5, 'hello')], 5, ME)).toEqual([])
  })

  it('keeps an accepted draft the poll has not reached yet', () => {
    expect(texts(reconcile([draft('a', 'hello', 9)], [], 5, ME))).toEqual(['hello'])
  })

  it('retires a draft the poll returned before its own post answered', () => {
    // No seq recorded yet: a poll already in flight can carry it back first.
    expect(reconcile([draft('a', 'hello')], [said(5, 'hello')], 5, ME)).toEqual([])
  })

  it('matches one for one, so the same sentence twice does not retire both', () => {
    const queue = [draft('a', 'ok'), draft('b', 'ok')]
    expect(texts(reconcile(queue, [said(5, 'ok')], 5, ME))).toEqual(['ok'])
  })

  it('ignores the same words from somebody else', () => {
    expect(texts(reconcile([draft('a', 'ok')], [said(5, 'ok', 'p_nova')], 5, ME))).toEqual(['ok'])
  })

  it('leaves drafts alone before this browser has joined', () => {
    expect(texts(reconcile([draft('a', 'ok')], [said(5, 'ok')], 5, undefined))).toEqual(['ok'])
  })

  it('keeps the ones still waiting when an earlier draft lands', () => {
    const queue = [draft('a', 'first', 5), draft('b', 'second')]
    expect(texts(reconcile(queue, [said(5, 'first')], 5, ME))).toEqual(['second'])
  })
})
