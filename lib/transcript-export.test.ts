import { describe, expect, it } from 'vitest'
import { toJson, toMarkdown, transcriptFilename, type TranscriptSource } from './transcript-export'

const channel = {
  id: 'v6dJ9tlHTAXdLnKfb5FmkA',
  name: 'orders-api',
  mode: 'standard',
  created_at: '2026-09-12T09:40:00Z',
  expires_at: '2026-09-13T09:40:00Z',
}

const source = (over: Partial<TranscriptSource> = {}): TranscriptSource => ({
  channel,
  exportedAt: '2026-09-12T10:05:00Z',
  participants: [
    { id: 'p_1', name: 'Maya’s agent', role: 'agent', presence: 'active', client: 'claude-code' },
    { id: 'p_2', name: 'Maya', role: 'human', presence: 'active' },
  ],
  items: [
    { seq: 1, ts: '2026-09-12T09:41:00Z', type: 'system', event: 'participant.joined', text: 'Maya’s agent joined' },
    {
      seq: 2,
      ts: '2026-09-12T09:42:00Z',
      type: 'message',
      from: { id: 'p_1', name: 'Maya’s agent', role: 'agent' },
      text: 'Does POST /refunds return the refund?',
      kind: 'message',
    },
  ],
  ...over,
})

describe('transcriptFilename', () => {
  it('slugs the channel name and dates the file', () => {
    expect(transcriptFilename(channel, 'md', '2026-09-12T10:05:00Z')).toBe('wave-orders-api-2026-09-12.md')
  })

  it('falls back to the channel ID when there is no name', () => {
    expect(transcriptFilename({ id: 'abc123', name: '   ' }, 'json', '2026-09-12T10:05:00Z')).toBe(
      'wave-abc123-2026-09-12.json',
    )
  })

  it('does not leave punctuation stranded at either end', () => {
    expect(transcriptFilename({ id: 'x', name: '  Release 4.2! ' }, 'md', '2026-01-02T00:00:00Z')).toBe(
      'wave-release-4-2-2026-01-02.md',
    )
  })
})

describe('toJson', () => {
  it('keeps every item and names the channel it came from', () => {
    const parsed = JSON.parse(toJson(source()))
    expect(parsed.channel.id).toBe(channel.id)
    expect(parsed.exported_at).toBe('2026-09-12T10:05:00Z')
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[1].text).toBe('Does POST /refunds return the refund?')
  })

  it('carries the roster without presence, which is a live fact and not a recorded one', () => {
    const parsed = JSON.parse(toJson(source()))
    expect(parsed.participants[0]).toEqual({
      id: 'p_1',
      name: 'Maya’s agent',
      role: 'agent',
      client: 'claude-code',
    })
  })

  it('ends with a newline, so the file is well formed for a shell', () => {
    expect(toJson(source()).endsWith('}\n')).toBe(true)
  })
})

describe('toMarkdown', () => {
  it('titles the file with the channel name and lists who was there', () => {
    const md = toMarkdown(source())
    expect(md).toContain('# orders-api')
    expect(md).toContain('- **Maya’s agent** (agent) — claude-code')
    expect(md).toContain('- **Maya** (human)')
  })

  it('falls back to the channel ID when the channel has no name', () => {
    expect(toMarkdown(source({ channel: { ...channel, name: '' } }))).toContain(`# Channel ${channel.id}`)
  })

  it('keeps events, because they explain why a conversation stops', () => {
    expect(toMarkdown(source())).toContain('_Maya’s agent joined_')
  })

  it('shows an unknown event by name rather than dropping it', () => {
    const md = toMarkdown(
      source({
        items: [{ seq: 1, ts: '2026-09-12T09:41:00Z', type: 'system', event: 'participant.teleported' }],
      }),
    )
    expect(md).toContain('participant.teleported')
  })

  it('marks the message that ended the conversation', () => {
    const md = toMarkdown(
      source({
        items: [
          {
            seq: 3,
            ts: '2026-09-12T09:50:00Z',
            type: 'message',
            from: { id: 'p_1', name: 'Maya’s agent', role: 'agent' },
            text: 'Shipped.',
            kind: 'done',
          },
        ],
      }),
    )
    expect(md).toContain('· done')
  })

  it('indents a multi-line message so a code block stays inside its bullet', () => {
    const md = toMarkdown(
      source({
        items: [
          {
            seq: 4,
            ts: '2026-09-12T09:51:00Z',
            type: 'message',
            from: { id: 'p_1', name: 'Agent', role: 'agent' },
            text: '```ts\nconst a = 1\n```',
            kind: 'message',
          },
        ],
      }),
    )
    expect(md).toContain('  ```ts\n  const a = 1\n  ```')
  })

  it('says so plainly when nothing was said', () => {
    expect(toMarkdown(source({ items: [] }))).toContain('_Nothing was said in this channel._')
  })

  it('notes that an e2ee transcript was decrypted in the browser', () => {
    expect(toMarkdown(source({ channel: { ...channel, mode: 'e2ee' } }))).toContain('decrypted in the browser')
  })
})
