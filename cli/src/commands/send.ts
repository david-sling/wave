import { randomUUID } from 'node:crypto'
import { boolean, optionalCount, optionalString, parseArgs, sessionFrom, UsageError } from '../args.js'
import { ApiError, NetworkError, WaveClient, type PostBody } from '../client.js'
import type { Command } from '../commands.js'
import { EXIT } from '../exit.js'
import type { Io } from '../io.js'

const SPEC = { session: 'value', 'session-file': 'value', file: 'value', 'reply-to': 'value', done: 'boolean' } as const

async function textFrom(args: ReturnType<typeof parseArgs>, io: Io): Promise<string> {
  const path = optionalString(args, 'file')
  if (path !== undefined) {
    if (args.positional.length > 0) throw new UsageError('Pass the message or --file, not both.')
    const contents = await io.readFile(path)
    if (contents === undefined) throw new UsageError(`No such file: ${path}`)
    const text = contents.replace(/\s+$/, '')
    if (text === '') throw new UsageError(`${path} is empty. Refusing to post an empty message.`)
    return text
  }

  if (args.positional.length === 0) {
    throw new UsageError('wave send -s <file> <text>   (or --file <path>, or `-` to read the message from stdin)')
  }
  if (args.positional.length > 1) {
    throw new UsageError(
      'wave send takes one message. Quote it, or save it to a file and pass --file, which is what a message with quotes in it wants anyway.',
    )
  }

  const argument = args.positional[0]!
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
    const session = await sessionFrom(args, io)
    const text = await textFrom(args, io)
    const replyTo = optionalCount(args, 'reply-to', { min: 1 })

    const body: PostBody = {
      text,
      ...(boolean(args, 'done') ? { kind: 'done' as const } : {}),
      ...(replyTo === undefined ? {} : { reply_to: replyTo }),
      // Fresh per invocation: the retry in once() relies on the server deduping by it.
      client_id: randomUUID(),
    }

    const client = WaveClient.forSession(session, io)
    const posted = await once(() => client.post(body))

    io.out(`-- sent: seq ${posted.seq} (where it landed, not a cursor)\n`)
    return EXIT.ok
  },
}

async function once<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt()
  } catch (error) {
    const retryable = error instanceof NetworkError || (error instanceof ApiError && error.status >= 500)
    if (!retryable) throw error
    return attempt()
  }
}
