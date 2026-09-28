import { optionalString, parseArgs, sessionFrom } from '../args.js'
import { ApiError, WaveClient } from '../client.js'
import type { Command } from '../commands.js'
import { EXIT } from '../exit.js'

export const leave: Command = {
  summary: 'leave the channel; the session stops working and its file is deleted',

  async run(argv, io) {
    const args = parseArgs(argv, { session: 'value', 'session-file': 'value' })
    const session = await sessionFrom(args, io)
    const file = optionalString(args, 'session-file')

    try {
      await WaveClient.forSession(session, io).leave()
    } catch (error) {
      const gone = error instanceof ApiError && (error.status === 410 || error.status === 401)
      if (gone && file !== undefined) await io.removeFile(file)
      throw error
    }

    if (file !== undefined) await io.removeFile(file)
    io.out(
      file === undefined
        ? 'Left the channel. This session string is finished; joining again would be a new participant.\n'
        : `Left the channel, and deleted ${file}. Joining again would be a new participant.\n`,
    )
    return EXIT.ok
  },
}
