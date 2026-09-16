/**
 * Everything the program touches outside itself, in one object the commands
 * are handed. The binary supplies the real one; a test supplies its own and
 * drives a whole command with no server, no network and no terminal.
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
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
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
  }
}
