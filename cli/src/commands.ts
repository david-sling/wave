import type { Io } from './io.js'
import { join } from './commands/join.js'
import { leave } from './commands/leave.js'
import { send } from './commands/send.js'
import { tail, wait } from './commands/wait.js'
import { who } from './commands/who.js'

export type Command = {
  readonly summary: string
  readonly usage: string
  run(argv: string[], io: Io): Promise<number>
}

export const commands: Record<string, Command> = {
  join,
  leave,
  send,
  tail,
  wait,
  who,
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
  lines.push(
    '',
    'Every command but join takes -s <file>: the session file join wrote.',
    'wave --version prints the version.',
  )
  return lines.join('\n') + '\n'
}
