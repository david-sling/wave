import { readFile, rm, writeFile } from 'node:fs/promises'

/**
 * Everything the program touches outside itself, in one object the commands
 * are handed. The binary supplies the real one; a test supplies its own and
 * drives a whole command with no server, no network and no terminal.
 *
 * The file methods reach only a path the caller named on the command line:
 * `-s <file>` for the session, `send --file <path>` for a message. The CLI
 * has no path of its own, so two agents share a file only by being told the
 * same one (ARCHITECTURE section 11).
 */
export type Io = {
  out(text: string): void
  err(text: string): void
  /** Read to end of input. Only `send -` calls it. */
  stdin(): Promise<string>
  fetch: typeof globalThis.fetch
  env: Record<string, string | undefined>
  sleep(ms: number): Promise<void>
  /** Milliseconds, for deadlines only. Injected so a test can hold a poll for fifty seconds in no time at all. */
  now(): number
  /** `undefined` when there is no such file. */
  readFile(path: string): Promise<string | undefined>
  /** Readable by the owner only: a session file holds a participant token. */
  writeFile(path: string, text: string): Promise<void>
  /** Nothing to do when the file is already gone. */
  removeFile(path: string): Promise<void>
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function readIfThere(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export function processIo(): Io {
  return {
    out: (text) => void process.stdout.write(text),
    err: (text) => void process.stderr.write(text),
    stdin: readStdin,
    fetch: (...args) => globalThis.fetch(...args),
    env: process.env,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    readFile: readIfThere,
    writeFile: (path, text) => writeFile(path, text, { mode: 0o600 }),
    removeFile: (path) => rm(path, { force: true }),
  }
}
