import { randomUUID } from 'node:crypto'
import { boolean, optionalCount, parseArgs, sessionFrom, UsageError } from '../args.js'
import { ApiError, NetworkError, WaveClient, type PostBody } from '../client.js'
import type { Command } from '../commands.js'
import { EXIT } from '../exit.js'
import type { Io } from '../io.js'

/**
 * `wave send --session <s> <text> [--done] [--reply-to <seq>]`
 *
 * `-` reads the text from stdin, which is how an agent sends a stack trace or
 * a diff without fighting its own shell over quoting. The curl prompt writes
 * the message to a file and pipes it through `jq -Rs` for exactly this reason,
 * and a client that only took an argument would have solved nothing.
 */

const SPEC = { session: 'value', 'reply-to': 'value', done: 'boolean' } as const

async function textFrom(args: ReturnType<typeof parseArgs>, io: Io): Promise<string> {
  if (args.positional.length === 0) {
    throw new UsageError('wave send --session <s> <text>   (or `-` to read the message from stdin)')
  }
  if (args.positional.length > 1) {
    throw new UsageError(
      'wave send takes one message. Quote it, or pass `-` and send it on stdin, which is what a message with quotes or newlines in it wants anyway.',
    )
  }

  const argument = args.positional[0]!
  // Trailing whitespace only: a heredoc or a pipe almost always ends in a
  // newline, and leading whitespace is the indentation of whatever was pasted.
  const text = (argument === '-' ? await io.stdin() : argument).replace(/\s+$/, '')
  if (text === '') {
    throw new UsageError(
      argument === '-'
        ? 'Nothing arrived on stdin, so there is nothing to send. Refusing to post an empty message.'
        : 'Refusing to post an empty message.',
    )
  }
  return text
}

export const send: Command = {
  summary: 'post a message to the channel',

  async run(argv, io) {
    const args = parseArgs(argv, SPEC)
    const session = sessionFrom(args, io.env)
    const text = await textFrom(args, io)
    const replyTo = optionalCount(args, 'reply-to', { min: 1 })

    const body: PostBody = {
      text,
      ...(boolean(args, 'done') ? { kind: 'done' as const } : {}),
      ...(replyTo === undefined ? {} : { reply_to: replyTo }),
      // Fresh per invocation, and the CLI's own, so an agent cannot reuse one
      // by accident. Its job is the retry below: the same id within five
      // minutes gets the same seq back and posts nothing new, so a send whose
      // response was lost in transit cannot land twice.
      client_id: randomUUID(),
    }

    const client = WaveClient.forSession(session, io)
    const posted = await once(() => client.post(body))

    // The seq is where this message landed, not how far this agent has read.
    // Saying so is the whole of the fix in `e757a17`: an agent that carried a
    // post's seq forward as a cursor skipped everything posted while its own
    // message was in flight.
    io.out(`-- sent: seq ${posted.seq} (where it landed, not a cursor)\n`)
    return EXIT.ok
  },
}

/**
 * One retry, for the failures that are about the wire rather than the message.
 * A 4xx is the instance's answer and repeating it changes nothing.
 */
async function once<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt()
  } catch (error) {
    const retryable = error instanceof NetworkError || (error instanceof ApiError && error.status >= 500)
    if (!retryable) throw error
    return attempt()
  }
}
