import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit.js'
import { run } from '../src/index.js'
import { encodeSession } from '../src/session.js'
import { apiError, harness, json, sentBody, type Handler } from './support.js'

const SESSION = encodeSession({
  host: 'https://wave.example.com',
  channel_id: '-j7yRyQ2',
  participant_id: 'p_9f3',
  token: 'tok_abcdefghijklmnopqrstuvwxyz',
})

const posted: Handler = () => json({ seq: 12, ts: '2026-09-11T10:15:40Z' }, { status: 201 })

describe('wave send', () => {
  it('posts the text it was given, and says where it landed', async () => {
    const test = harness({ handler: posted })

    expect(await run(['send', '--session', SESSION, 'Build passes.'], test.io)).toBe(EXIT.ok)

    expect(test.calls[0]!.url.href).toBe('https://wave.example.com/api/v1/channels/-j7yRyQ2/messages')
    expect(sentBody(test.calls[0]!.init)).toMatchObject({ text: 'Build passes.' })
    // Not a cursor, and the line says so: an agent that carried a post's seq
    // forward as one skipped everything posted while its message was in flight.
    expect(test.text()).toBe('-- sent: seq 12 (where it landed, not a cursor)\n')
  })

  it('takes the session from the environment when the flag is absent', async () => {
    const test = harness({ handler: posted, env: { WAVE_SESSION: SESSION } })

    expect(await run(['send', 'Build passes.'], test.io)).toBe(EXIT.ok)
    expect((test.calls[0]!.init!.headers as Record<string, string>).authorization).toBe(
      'Bearer tok_abcdefghijklmnopqrstuvwxyz',
    )
  })

  it('reads the message from stdin on `-`, which is how a diff gets sent at all', async () => {
    const diff = '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-one\n+two\n'
    const test = harness({ handler: posted, stdin: diff })

    expect(await run(['send', '--session', SESSION, '-'], test.io)).toBe(EXIT.ok)
    expect(sentBody(test.calls[0]!.init)).toMatchObject({ text: diff.trimEnd() })
  })

  it('refuses an empty message rather than posting one', async () => {
    const empty = harness({ handler: posted, stdin: '\n  \n' })
    expect(await run(['send', '--session', SESSION, '-'], empty.io)).toBe(EXIT.failed)
    expect(empty.errors()).toContain('Nothing arrived on stdin')
    expect(empty.calls).toHaveLength(0)

    const blank = harness({ handler: posted })
    expect(await run(['send', '--session', SESSION, '   '], blank.io)).toBe(EXIT.failed)
    expect(blank.calls).toHaveLength(0)
  })

  it('carries --done and --reply-to into the body', async () => {
    const test = harness({ handler: posted })

    expect(await run(['send', '--session', SESSION, '--done', '--reply-to', '7', 'Signing off.'], test.io)).toBe(EXIT.ok)
    expect(sentBody(test.calls[0]!.init)).toMatchObject({ text: 'Signing off.', kind: 'done', reply_to: 7 })
  })

  it('sends no kind and no reply_to when neither was asked for', async () => {
    const test = harness({ handler: posted })
    await run(['send', '--session', SESSION, 'Build passes.'], test.io)

    const body = sentBody(test.calls[0]!.init) as Record<string, unknown>
    expect(body).not.toHaveProperty('kind')
    expect(body).not.toHaveProperty('reply_to')
  })

  it('refuses a --reply-to that is not a seq', async () => {
    const test = harness({ handler: posted })

    expect(await run(['send', '--session', SESSION, '--reply-to', '0', 'x'], test.io)).toBe(EXIT.failed)
    expect(await run(['send', '--session', SESSION, '--reply-to', 'seven', 'x'], test.io)).toBe(EXIT.failed)
    expect(test.calls).toHaveLength(0)
  })

  it('gives every invocation its own client_id', async () => {
    const seen: string[] = []
    const remember: Handler = (_url, init) => {
      seen.push((sentBody(init) as { client_id: string }).client_id)
      return posted(_url, init)
    }

    await run(['send', '--session', SESSION, 'one'], harness({ handler: remember }).io)
    await run(['send', '--session', SESSION, 'one'], harness({ handler: remember }).io)

    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
    expect(seen[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('retries a 5xx once under the same client_id, so the retry cannot double-post', async () => {
    const seen: string[] = []
    let attempts = 0
    const flaky: Handler = (_url, init) => {
      seen.push((sentBody(init) as { client_id: string }).client_id)
      attempts += 1
      return attempts === 1 ? apiError(503, 'server_error', 'Something went wrong on this instance.') : posted(_url, init)
    }
    const test = harness({ handler: flaky })

    expect(await run(['send', '--session', SESSION, 'Build passes.'], test.io)).toBe(EXIT.ok)
    expect(seen).toEqual([seen[0], seen[0]])
  })

  it('exits 6 when the secret filter refuses the text, and says it will be refused again', async () => {
    const test = harness({
      handler: () =>
        apiError(422, 'rejected_content', 'This message looks like it contains an AWS access key id.', {
          hint: 'Nothing was posted. Remove the credential, or describe it instead of pasting it, and send again.',
        }),
    })

    // Not a transport error: an agent that read it as one would retry it forever.
    expect(await run(['send', '--session', SESSION, 'AKIA...'], test.io)).toBe(EXIT.rejected)
    expect(test.errors()).toContain('AWS access key id')
    expect(test.errors()).toContain('Nothing was posted')
    expect(test.calls).toHaveLength(1)
  })

  it('will not send without a session, and says where one comes from', async () => {
    const test = harness({ handler: posted })

    expect(await run(['send', 'Build passes.'], test.io)).toBe(EXIT.failed)
    expect(test.errors()).toContain('WAVE_SESSION')
    expect(test.calls).toHaveLength(0)
  })
})
