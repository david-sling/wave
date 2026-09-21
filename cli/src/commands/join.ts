import { optionalString, parseArgs, requireString, UsageError } from '../args.js'
import { WaveClient } from '../client.js'
import { EXIT } from '../exit.js'
import type { Command } from '../commands.js'
import { cursorLine, renderRoster, sessionLine } from '../render.js'
import { encodeSession, normalizeHost } from '../session.js'

/**
 * `wave join <channel-url> --name <name> [--client <product>]`
 *
 * The one command that takes a URL instead of a session, and the only one that
 * produces one.
 */

export type ChannelLink = {
  host: string
  channelId: string
  invite: string
  /** `e2ee` only: the second half of the fragment (section 12). */
  key?: string
}

/**
 * The channel page URL, whole: `https://host/c/<id>#<invite>` and, in `e2ee`,
 * `#<invite>.<key>`. One argument rather than three, because three is three
 * chances to pair the wrong invite with the right channel.
 */
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

  // The fragment is the capability. A link copied from an address bar that
  // dropped it looks complete and is not, so this is named rather than
  // reported as a 401 from the join call.
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

/**
 * The agent product, self-reported and unverified whichever way it is filled,
 * exactly as PRODUCT section 7 says. `--client` first; the environment only
 * where a product is known to mark itself, and that list grows by being
 * learned rather than guessed.
 */
export function detectClient(env: Record<string, string | undefined>): string | undefined {
  if (env.CLAUDECODE) return 'claude-code'
  return undefined
}

const SPEC = { name: 'value', client: 'value', role: 'value' } as const

export const join: Command = {
  summary: 'join a channel from its URL, and print the session string to use after',

  async run(argv, io) {
    const args = parseArgs(argv, SPEC)
    const target = args.positional[0]
    if (target === undefined) {
      throw new UsageError('wave join <channel-url> --name <name> [--client <product>]')
    }
    if (args.positional.length > 1) {
      throw new UsageError('wave join takes one channel URL. Quote it if your shell is splitting it.')
    }

    const link = parseChannelLink(target)
    const name = requireString(args, 'name')
    const role = optionalString(args, 'role') ?? 'agent'
    if (role !== 'agent' && role !== 'human') throw new UsageError('--role is agent or human.')
    const client = optionalString(args, 'client') ?? detectClient(io.env)

    const invited = new WaveClient({ host: link.host, channelId: link.channelId, token: link.invite, fetch: io.fetch })

    const joined = await invited.join({ name, role, ...(client === undefined ? {} : { client }) })

    // Both directions, before anything is sent: plaintext into an encrypted
    // room and ciphertext into a plain one are each worse than not joining.
    // The participant has already been minted, so say how to undo it.
    const mismatch = modeMismatch(joined.channel.mode, link.key !== undefined)
    if (mismatch !== undefined) {
      const session = encodeSession({
        host: link.host,
        channel_id: link.channelId,
        participant_id: joined.participant_id,
        token: joined.participant_token,
      })
      io.err(`wave: ${mismatch}\nYou are in the channel: \`wave leave --session ${session}\` to undo this join.\n`)
      return EXIT.failed
    }

    const session = encodeSession({
      host: link.host,
      channel_id: link.channelId,
      participant_id: joined.participant_id,
      token: joined.participant_token,
      ...(link.key === undefined ? {} : { key: link.key }),
    })

    const heading = joined.channel.name === '' ? 'Joined as' : `Joined "${joined.channel.name}" as`
    io.out(
      [
        `${heading} "${joined.name}".`,
        ...renderRoster(joined.participants, joined.participant_id),
        sessionLine(session),
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
