import { optionalString, parseArgs, requireString, UsageError } from '../args.js'
import { WaveClient } from '../client.js'
import { EXIT } from '../exit.js'
import type { Command } from '../commands.js'
import { cursorLine, renderRoster, sessionLine } from '../render.js'
import { encodeSession, normalizeHost } from '../session.js'

export type ChannelLink = {
  host: string
  channelId: string
  invite: string
  key?: string
}

export function parseChannelLink(value: string): ChannelLink {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new UsageError(`Not a channel URL: ${value}. It looks like https://your-instance/c/<id>#<invite>.`)
  }

  const host = normalizeHost(url.origin)
  const segments = url.pathname.split('/').filter((part) => part !== '')
  if (segments.length !== 2 || segments[0] !== 'c') {
    throw new UsageError(`That URL has no channel in it: ${value}. A channel page is /c/<id>.`)
  }
  const channelId = decodeURIComponent(segments[1]!)

  const fragment = url.hash.replace(/^#/, '')
  if (fragment === '') {
    throw new UsageError(
      `That channel URL has no invite after the #: ${value}. The part after the # is what lets you in, and it is never sent to the server, so a link without it cannot join.`,
    )
  }

  const [invite, key, ...rest] = fragment.split('.')
  if (rest.length > 0 || invite === undefined || invite === '') {
    throw new UsageError(`That channel URL's invite is not one this client understands: ${value}`)
  }

  return { host, channelId, invite, ...(key === undefined || key === '' ? {} : { key }) }
}

export function detectClient(env: Record<string, string | undefined>): string | undefined {
  if (env.CLAUDECODE) return 'claude-code'
  return undefined
}

const SPEC = { name: 'value', client: 'value', role: 'value', 'session-file': 'value' } as const

export const join: Command = {
  summary: 'join a channel from its URL, and save the session to -s <file>',

  async run(argv, io) {
    const args = parseArgs(argv, SPEC)
    const target = args.positional[0]
    if (target === undefined) {
      throw new UsageError('wave join <channel-url> --name <name> [--client <product>] [-s <file>]')
    }
    if (args.positional.length > 1) {
      throw new UsageError('wave join takes one channel URL. Quote it if your shell is splitting it.')
    }

    const link = parseChannelLink(target)
    const name = requireString(args, 'name')
    const role = optionalString(args, 'role') ?? 'agent'
    if (role !== 'agent' && role !== 'human') throw new UsageError('--role is agent or human.')
    const client = optionalString(args, 'client') ?? detectClient(io.env)
    const file = optionalString(args, 'session-file')

    if (file !== undefined && (await io.readFile(file))?.trim()) {
      throw new UsageError(
        `${file} already holds a session: another agent on this machine joined with it, or you already did. Use a different file and name, or \`wave leave -s ${file}\` if that session is finished.`,
      )
    }

    const invited = new WaveClient({ host: link.host, channelId: link.channelId, token: link.invite, fetch: io.fetch })

    const joined = await invited.join({ name, role, ...(client === undefined ? {} : { client }) })

    const mismatch = modeMismatch(joined.channel.mode, link.key !== undefined)
    if (mismatch !== undefined) {
      const session = encodeSession({
        host: link.host,
        channel_id: link.channelId,
        participant_id: joined.participant_id,
        token: joined.participant_token,
      })
      if (file === undefined) {
        io.err(`wave: ${mismatch}\nYou are in the channel: \`wave leave --session ${session}\` to undo this join.\n`)
      } else {
        await io.writeFile(file, session + '\n')
        io.err(`wave: ${mismatch}\nYou are in the channel: \`wave leave -s ${file}\` to undo this join.\n`)
      }
      return EXIT.failed
    }

    const session = encodeSession({
      host: link.host,
      channel_id: link.channelId,
      participant_id: joined.participant_id,
      token: joined.participant_token,
      ...(link.key === undefined ? {} : { key: link.key }),
    })

    if (file !== undefined) await io.writeFile(file, session + '\n')

    const heading = joined.channel.name === '' ? 'Joined as' : `Joined "${joined.channel.name}" as`
    io.out(
      [
        `${heading} "${joined.name}".`,
        ...renderRoster(joined.participants, joined.participant_id),
        file === undefined ? sessionLine(session) : `-- session saved to ${file}`,
        cursorLine(joined.last_seq, false),
        '',
      ].join('\n'),
    )
    return EXIT.ok
  },
}

function modeMismatch(mode: string, hasKey: boolean): string | undefined {
  if (mode === 'e2ee' && !hasKey) {
    return 'This channel is end-to-end encrypted and the link carried no key, so nothing you sent could be read and nothing you received could be decrypted.'
  }
  if (mode !== 'e2ee' && hasKey) {
    return `This link carries an encryption key and the channel is ${mode}, so everything sent would go as plaintext. Nothing has been sent.`
  }
  return undefined
}
