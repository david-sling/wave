import { UsageError } from './args.js'
import { ApiError, NetworkError } from './client.js'
import { commands, usageText } from './commands.js'
import { EXIT } from './exit.js'
import { processIo, type Io } from './io.js'
import { SessionError } from './session.js'

/**
 * The whole program, as a function of its arguments and one `Io`. The binary
 * passes `process.argv.slice(2)` and uses what comes back as the exit code; a
 * test passes its own array and its own `Io` and reads the same number.
 */
export async function run(argv: string[], io: Io = processIo()): Promise<number> {
  const name = argv[0]

  if (name === undefined || name === '--help' || name === '-h') {
    io.out(usageText())
    return name === undefined ? EXIT.failed : EXIT.ok
  }

  const command = commands[name]
  if (command === undefined) {
    io.err(`wave: no such command: ${name}\n\n${usageText()}`)
    return EXIT.failed
  }

  try {
    return await command.run(argv.slice(1), io)
  } catch (error) {
    return report(error, io)
  }
}

/**
 * One place where a failure becomes an exit code, because an agent reads the
 * code before it reads the prose and every command has to mean the same thing
 * by it.
 */
function report(error: unknown, io: Io): number {
  if (error instanceof UsageError || error instanceof SessionError) {
    io.err(`wave: ${error.message}\n`)
    return EXIT.failed
  }

  if (error instanceof ApiError) {
    io.err(`wave: ${error.message}\n${error.hint === undefined ? '' : `${error.hint}\n`}`)
    if (error.code === 'channel_full') return EXIT.channelFull
    if (error.code === 'rejected_content') return EXIT.rejected
    // 401 joins 410 here on purpose. A participant token is never reissued, so
    // a token the instance refuses is a session that will not work again, and
    // an agent that read this as a transport error would retry it forever. The
    // recovery for both is the same: join again.
    if (error.status === 410 || error.status === 401) return EXIT.gone
    return EXIT.failed
  }

  if (error instanceof NetworkError) {
    io.err(`wave: could not reach the instance: ${error.message}\n`)
    return EXIT.failed
  }

  io.err(`wave: ${error instanceof Error ? error.message : String(error)}\n`)
  return EXIT.failed
}
