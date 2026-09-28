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

export class FileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileError'
  }
}

const REASONS: Record<string, string> = {
  EACCES: 'permission denied',
  EPERM: 'permission denied',
  ENOENT: 'the directory it would go in does not exist',
  ENOTDIR: 'part of that path is a file, not a directory',
  EISDIR: 'that is a directory',
  EROFS: 'that filesystem is read-only',
  ENOSPC: 'the disk is full',
}

export function fileError(action: 'read' | 'write' | 'delete', path: string, error: unknown): FileError {
  const code = (error as NodeJS.ErrnoException).code
  const reason = (code && REASONS[code]) ?? (error instanceof Error ? error.message : String(error))
  return new FileError(`Cannot ${action} ${path}: ${reason}.`)
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
    throw fileError('read', path, error)
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
    writeFile: (path, text) =>
      writeFile(path, text, { mode: 0o600 }).catch((error: unknown) => {
        throw fileError('write', path, error)
      }),
    removeFile: (path) =>
      rm(path, { force: true }).catch((error: unknown) => {
        throw fileError('delete', path, error)
      }),
  }
}
