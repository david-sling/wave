import type { Io } from './io.js'
import { join } from './commands/join.js'
import { send } from './commands/send.js'
import { tail, wait } from './commands/wait.js'

export type Command = {
  /** The line this command gets in the usage block. */
  readonly summary: string
  /** Everything after the command name, unparsed. Returns the exit code. */
  run(argv: string[], io: Io): Promise<number>
}

/**
 * The verbs of ARCHITECTURE section 11. The dispatcher knows nothing else
 * about them, so adding one is adding an entry here and nothing more.
 */
export const commands: Record<string, Command> = {
  join,
  send,
  tail,
  wait,
}

export function usageText(): string {
  const lines = ['Usage: wave <command> [options]']
  const names = Object.keys(commands).sort()
  if (names.length > 0) {
    lines.push('', 'Commands:')
    const width = Math.max(...names.map((name) => name.length))
    for (const name of names) {
      lines.push(`  ${name.padEnd(width)}  ${commands[name]!.summary}`)
    }
  }
  return lines.join('\n') + '\n'
}
