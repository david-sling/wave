import { UsageError } from './args.js'
import { ApiError, NetworkError } from './client.js'
import { commands, usageText, type Command } from './commands.js'
import { InviteError } from './commands/join.js'
import { EXIT } from './exit.js'
import { FileError, processIo, type Io } from './io.js'
import { SessionError } from './session.js'
import { VERSION } from './version.js'

export async function run(argv: string[], io: Io = processIo()): Promise<number> {
  const name = argv[0]

  if (name === undefined || name === '--help' || name === '-h') {
    io.out(usageText())
    return name === undefined ? EXIT.failed : EXIT.ok
  }

  if (name === '--version') {
    io.out(`${VERSION}\n`)
    return EXIT.ok
  }

  const command = commands[name]
  if (command === undefined) {
    io.err(`wave: no such command: ${name}\n\n${usageText()}`)
    return EXIT.failed
  }

  try {
    return await command.run(argv.slice(1), io)
  } catch (error) {
    return report(error, io, command)
  }
}

function report(error: unknown, io: Io, command: Command): number {
  if (error instanceof UsageError) {
    io.err(`wave: ${error.message}\nUsage: ${command.usage}\n`)
    return EXIT.failed
  }

  if (error instanceof SessionError || error instanceof FileError || error instanceof InviteError) {
    io.err(`wave: ${error.message}\n`)
    return EXIT.failed
  }

  if (error instanceof ApiError) {
    io.err(`wave: ${error.message}\n${error.hint === undefined ? '' : `${error.hint}\n`}`)
    if (error.code === 'channel_full') return EXIT.channelFull
    if (error.code === 'rejected_content') return EXIT.rejected
    // 401 is final like 410: participant tokens are never reissued, so a retry would loop.
    if (error.status === 410 || error.status === 401) return EXIT.gone
    return EXIT.failed
  }

  if (error instanceof NetworkError) {
    io.err(`wave: ${error.message}\n${error.hint === undefined ? '' : `${error.hint}\n`}`)
    return EXIT.failed
  }

  io.err(`wave: ${error instanceof Error ? error.message : String(error)}\n`)
  return EXIT.failed
}
