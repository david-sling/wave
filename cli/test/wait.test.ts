import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit.js'
import { run } from '../src/index.js'
import { encodeSession } from '../src/session.js'
import type { Item } from '../src/types.js'
import { apiError, harness, json, type Handler } from './support.js'

const SELF = 'p_9f3'

const SESSION = encodeSession({
  host: 'https://wave.example.com',
  channel_id: '-j7yRyQ2',
  participant_id: SELF,
  token: 'tok_abcdefghijklmnopqrstuvwxyz',
})

const mine: Item = {
  seq: 8,
  ts: '2026-09-11T10:15:40Z',
  type: 'message',
  kind: 'message',
  from: { id: SELF, name: 'Mac agent', role: 'agent' },
  text: 'Anyone there?',
}

const theirs: Item = {
  seq: 9,
  ts: '2026-09-11T10:16:40Z',
  type: 'message',
  kind: 'message',
  from: { id: 'p_1aa', name: 'Windows agent', role: 'agent' },
  text: 'Build passes.',
}

const joinedEvent: Item = {
  seq: 7,
  ts: '2026-09-11T10:14:40Z',
  type: 'system',
  event: 'participant.joined',
  subject: { id: SELF, name: 'Mac agent', role: 'agent' },
  text: 'Mac agent joined',
}

const empty = (lastSeq: number) => json({ items: [], last_seq: lastSeq, participants: [] })
const round = (items: Item[], lastSeq: number) => json({ items, last_seq: lastSeq, participants: [] })

function script(responses: Array<(url: URL) => Response>): Handler {
  let index = 0
  return (url) => {
    const answer = responses[Math.min(index, responses.length - 1)]!
    index += 1
    return answer(url)
  }
}

describe('wave wait', () => {
  it('holds until someone else says something, then prints it and the next cursor', async () => {
    const test = harness({
      handler: script([() => empty(7), () => empty(7), () => round([theirs], 9)]),
    })

    expect(await run(['wait', '--session', SESSION, '--after', '7'], test.io)).toBe(EXIT.ok)
    expect(test.text()).toBe('[9] Windows agent: Build passes.\n-- next: --after 9\n')
    expect(test.calls).toHaveLength(3)
    expect(test.calls[0]!.url.searchParams.get('wait')).toBe('50')
    expect(test.calls[0]!.url.searchParams.get('after')).toBe('7')
  })

  it('keeps asking from where the last answer left off', async () => {
    const test = harness({ handler: script([() => empty(12), () => round([theirs], 13)]) })

    await run(['wait', '--session', SESSION, '--after', '7'], test.io)

    expect(test.calls.map((call) => call.url.searchParams.get('after'))).toEqual(['7', '12'])
  })

  it('never shows this agent its own message, and never stops for one', async () => {
    const test = harness({ handler: script([() => round([mine], 8), () => round([theirs], 9)]) })

    expect(await run(['wait', '--session', SESSION, '--after', '7'], test.io)).toBe(EXIT.ok)
    expect(test.text()).not.toContain('Anyone there?')
    expect(test.calls[1]!.url.searchParams.get('after')).toBe('8')
  })

  it('shows this agent its own arrival, because a system item has no author', async () => {
    const test = harness({ handler: script([() => round([joinedEvent], 7)]) })

    expect(await run(['wait', '--session', SESSION, '--after', '6'], test.io)).toBe(EXIT.ok)
    expect(test.text()).toBe('* Mac agent joined\n-- next: --after 7\n')
  })

  it('exits 2 when nothing comes, still printing one line to carry forward', async () => {
    const test = harness({ handler: () => empty(7) })

    expect(await run(['wait', '--session', SESSION, '--after', '7', '--timeout', '120'], test.io)).toBe(EXIT.timeout)
    expect(test.text()).toBe('-- next: --after 7\n')
    expect(test.calls.map((call) => call.url.searchParams.get('wait'))).toEqual(['50', '50', '20'])
  })

  it('carries the cursor forward over a timeout that only ever saw its own messages', async () => {
    const test = harness({ handler: script([() => round([mine], 8), () => empty(8)]) })

    expect(await run(['wait', '--session', SESSION, '--after', '7', '--timeout', '60'], test.io)).toBe(EXIT.timeout)
    expect(test.text()).toBe('-- next: --after 8\n')
  })

  it('reads what is already there and stops when asked for no wait at all', async () => {
    const test = harness({ handler: script([() => round([theirs], 9)]) })

    expect(await run(['wait', '--session', SESSION, '--after', '0', '--timeout', '0'], test.io)).toBe(EXIT.ok)
    expect(test.calls).toHaveLength(1)
    expect(test.calls[0]!.url.searchParams.get('wait')).toBe('0')
  })

  it('prints one raw item per line under --json, cursor last', async () => {
    const test = harness({ handler: script([() => round([theirs], 9)]) })

    await run(['wait', '--session', SESSION, '--after', '7', '--json'], test.io)

    const lines = test.text().trimEnd().split('\n')
    expect(JSON.parse(lines[0]!)).toEqual(theirs)
    expect(JSON.parse(lines[1]!)).toEqual({ cursor: 9 })
  })

  it('backs off on a 5xx, doubling to a sixty-second cap', async () => {
    const test = harness({ handler: () => apiError(503, 'server_error', 'Something went wrong on this instance.') })

    expect(await run(['wait', '--session', SESSION, '--after', '7', '--timeout', '900'], test.io)).toBe(EXIT.timeout)
    expect(test.naps.slice(0, 7)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000])
    expect(Math.max(...test.naps)).toBe(60_000)
    expect(test.text()).toBe('-- next: --after 7\n')
  })

  it('waits as long as a 429 says to, rather than guessing', async () => {
    const test = harness({
      handler: script([
        () => apiError(429, 'rate_limited', 'Too many polls.', { headers: { 'retry-after': '17' } }),
        () => round([theirs], 9),
      ]),
    })

    expect(await run(['wait', '--session', SESSION, '--after', '7'], test.io)).toBe(EXIT.ok)
    expect(test.naps).toEqual([17_000])
  })

  it('starts over from one second once a poll succeeds', async () => {
    const test = harness({
      handler: script([
        () => apiError(500, 'server_error', 'boom'),
        () => apiError(500, 'server_error', 'boom'),
        () => empty(7),
        () => apiError(500, 'server_error', 'boom'),
        () => round([theirs], 9),
      ]),
    })

    await run(['wait', '--session', SESSION, '--after', '7'], test.io)

    expect(test.naps).toEqual([1_000, 2_000, 1_000])
  })

  it('stops at once on a gone channel, because no amount of waiting fixes it', async () => {
    const test = harness({ handler: () => apiError(410, 'gone', 'This channel has expired or been closed.') })

    expect(await run(['wait', '--session', SESSION, '--after', '7'], test.io)).toBe(EXIT.gone)
    expect(test.calls).toHaveLength(1)
    expect(test.errors()).toContain('expired or been closed')
    expect(test.text()).toBe('')
  })

  it('does not retry its own bad request', async () => {
    const test = harness({ handler: () => apiError(400, 'invalid_request', 'after must be a number.') })

    expect(await run(['wait', '--session', SESSION, '--after', '7'], test.io)).toBe(EXIT.failed)
    expect(test.calls).toHaveLength(1)
  })

  it('writes nothing until a round is complete, which is what makes a run cut short safe', async () => {
    const printedSoFar: string[] = []
    let printed: () => string = () => ''
    const test = harness({
      handler: script([
        () => (printedSoFar.push(printed()), empty(7)),
        () => (printedSoFar.push(printed()), empty(7)),
        () => (printedSoFar.push(printed()), round([theirs], 9)),
      ]),
    })
    printed = test.text

    expect(await run(['wait', '--session', SESSION, '--after', '7'], test.io)).toBe(EXIT.ok)
    expect(printedSoFar).toEqual(['', '', ''])
    expect(test.text()).toBe('[9] Windows agent: Build passes.\n-- next: --after 9\n')
  })
})

describe('wave tail', () => {
  it('keeps printing, one cursor line per batch', async () => {
    let polls = 0
    const test = harness({
      handler: () => {
        polls += 1
        if (polls === 1) return round([theirs], 9)
        if (polls === 2) return empty(9)
        if (polls === 3) return round([{ ...theirs, seq: 10, text: 'And ships.' }], 10)
        return apiError(410, 'gone', 'This channel has expired or been closed.')
      },
    })

    expect(await run(['tail', '--session', SESSION, '--after', '7'], test.io)).toBe(EXIT.gone)
    expect(test.text()).toBe(
      [
        '[9] Windows agent: Build passes.',
        '-- next: --after 9',
        '[10] Windows agent: And ships.',
        '-- next: --after 10',
        '',
      ].join('\n'),
    )
  })

  it('has no timeout to give it', async () => {
    const test = harness({ handler: () => empty(7) })

    expect(await run(['tail', '--session', SESSION, '--after', '7', '--timeout', '10'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('No such option: --timeout')
    expect(test.calls).toHaveLength(0)
  })
})

describe('wave wait, marking what is addressed to this agent', () => {
  it('marks a mention of its own name, found from the roster the poll returns', async () => {
    const addressed: Item = { ...theirs, seq: 9, text: '@Mac agent can you take this?', reply_to: 4 }
    const test = harness({
      handler: () =>
        json({
          items: [addressed],
          last_seq: 9,
          participants: [
            { id: SELF, name: 'Mac agent', role: 'agent', presence: 'active' },
            { id: 'p_1aa', name: 'Windows agent', role: 'agent', presence: 'active' },
          ],
        }),
      env: { WAVE_SESSION: SESSION },
    })

    expect(await run(['wait', '--after', '8', '--timeout', '0'], test.io)).toBe(EXIT.ok)
    expect(test.text()).toContain('(reply to 4, mentions you): @Mac agent can you take this?')
  })
})
