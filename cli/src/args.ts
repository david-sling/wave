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

export function parseArgs(argv: string[], spec: Record<string, FlagKind>): Args {
  const flags: Record<string, string | true> = {}
  const positional: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!

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
 * The session, from the flag or from the environment. Both spellings exist
 * because an agent composing a command line and a human running one in a shell
 * want different ones; the flag wins so a one-off call can override an
 * exported value rather than silently using it.
 */
export function sessionFrom(args: Args, env: Record<string, string | undefined>): Session {
  const raw = optionalString(args, 'session') ?? env.WAVE_SESSION
  if (raw === undefined || raw.trim() === '') {
    throw new UsageError('No session: pass --session, or set WAVE_SESSION. `wave join` prints it.')
  }
  return decodeSession(raw)
}
