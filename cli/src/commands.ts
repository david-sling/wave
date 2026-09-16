export type Command = {
  /** The line this command gets in the usage block. */
  readonly summary: string
  /** Everything after the command name, unparsed. Returns the exit code. */
  run(argv: string[]): Promise<number>
}

/**
 * The six verbs of ARCHITECTURE section 11, registered as they are written.
 * The dispatcher knows nothing else about them, so adding one is adding an
 * entry here and nothing more.
 */
export const commands: Record<string, Command> = {}

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
