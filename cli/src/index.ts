import { commands, usageText } from './commands.js'

/**
 * The whole program, as a function of its arguments. The binary passes
 * `process.argv.slice(2)` and uses what comes back as the exit code; a test
 * passes its own array and reads the same number.
 */
export async function run(argv: string[]): Promise<number> {
  const name = argv[0]

  if (name === undefined || name === '--help' || name === '-h') {
    process.stdout.write(usageText())
    return name === undefined ? 1 : 0
  }

  const command = commands[name]
  if (command === undefined) {
    process.stderr.write(`wave: no such command: ${name}\n\n${usageText()}`)
    return 1
  }

  return command.run(argv.slice(1))
}
