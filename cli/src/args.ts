import type { Io } from './io.js'
import { decodeSession, type Session } from './session.js'

/**
 * Argument parsing, deliberately small and strict.
 *
 * Every varying part of a command is a suffix — that is the property the
 * permission grant rests on — so nothing here reorders or rewrites what it was
 * given. An unknown option is an error rather than a shrug: a mistyped
 * `--seesion` that parsed as nothing would send an unauthenticated request and
 * fail three layers away from its cause.
 */

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

export type FlagKind = 'value' | 'boolean'

export type Args = {
  flags: Record<string, string | true>
  positional: string[]
}

/** One letter each, and only for the flag an agent types on every call. */
const SHORT: Record<string, string> = { s: 'session-file' }

export function parseArgs(argv: string[], spec: Record<string, FlagKind>): Args {
  const flags: Record<string, string | true> = {}
  const positional: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index]!

    // A lone `-` is stdin and stays positional; `-x` is an option or a mistake.
    if (/^-[A-Za-z]$/.test(arg)) {
      const long = SHORT[arg.slice(1)]
      if (long === undefined || spec[long] === undefined) throw new UsageError(`No such option: ${arg}`)
      arg = `--${long}`
    }

    // Everything after `--` is text, however it is spelled. A message that
    // begins with a dash has to be sendable.
    if (arg === '--') {
      positional.push(...argv.slice(index + 1))
      break
    }

    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const equals = arg.indexOf('=')
    const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals)
    const kind = spec[name]
    if (kind === undefined) throw new UsageError(`No such option: --${name}`)

    if (kind === 'boolean') {
      if (equals !== -1) throw new UsageError(`--${name} takes no value.`)
      flags[name] = true
      continue
    }

    const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1)
    if (value === undefined) throw new UsageError(`--${name} needs a value.`)
    if (equals === -1) index += 1
    flags[name] = value
  }

  return { flags, positional }
}

export function optionalString(args: Args, name: string): string | undefined {
  const value = args.flags[name]
  if (value === undefined) return undefined
  if (value === true) throw new UsageError(`--${name} needs a value.`)
  return value
}

export function requireString(args: Args, name: string): string {
  const value = optionalString(args, name)
  if (value === undefined || value === '') throw new UsageError(`--${name} is required.`)
  return value
}

export function optionalCount(args: Args, name: string, { min = 0 }: { min?: number } = {}): number | undefined {
  const raw = optionalString(args, name)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) {
    throw new UsageError(`--${name} must be a whole number${min > 0 ? ` of at least ${min}` : ' of 0 or more'}.`)
  }
  return value
}

export function boolean(args: Args, name: string): boolean {
  return args.flags[name] === true
}

/**
 * The session: from `-s <file>`, from `--session`, or from `WAVE_SESSION`.
 *
 * The file is what the join prompt uses. The command then starts with the
 * same words on every call and carries no token, so the permission an agent's
 * tool records for the first call covers every later one. The other two are
 * for a person at a shell.
 */
export async function sessionFrom(args: Args, io: Pick<Io, 'env' | 'readFile'>): Promise<Session> {
  const file = optionalString(args, 'session-file')
  const flag = optionalString(args, 'session')
  if (file !== undefined && flag !== undefined) throw new UsageError('Pass -s or --session, not both.')

  if (file !== undefined) {
    const raw = (await io.readFile(file))?.trim()
    if (raw === undefined || raw === '') {
      throw new UsageError(
        `No session in ${file}. \`wave join <channel-url> --name <name> -s ${file}\` writes it, and \`wave leave\` deletes it.`,
      )
    }
    return decodeSession(raw)
  }

  const raw = flag ?? io.env.WAVE_SESSION
  if (raw === undefined || raw.trim() === '') {
    throw new UsageError('No session: pass -s <file>, --session, or set WAVE_SESSION. `wave join` gives you one.')
  }
  return decodeSession(raw)
}
