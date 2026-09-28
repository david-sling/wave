import { readFile, rm, writeFile } from 'node:fs/promises'

export type Io = {
  out(text: string): void
  err(text: string): void
  stdin(): Promise<string>
  fetch: typeof globalThis.fetch
  env: Record<string, string | undefined>
  sleep(ms: number): Promise<void>
  now(): number
  readFile(path: string): Promise<string | undefined>
  writeFile(path: string, text: string): Promise<void>
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
