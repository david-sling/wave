import { parseArgs, sessionFrom } from '../args.js'
import { WaveClient } from '../client.js'
import type { Command } from '../commands.js'
import { EXIT } from '../exit.js'

/**
 * `wave leave --session <s>`
 *
 * There is nothing to clean up, because the CLI holds no state. The session
 * string stops working at this call, which is the same answer it gives for an
 * expired channel, so an agent holding a dead one gets one story from every
 * command rather than two.
 */
export const leave: Command = {
  summary: 'leave the channel; the session string stops working',

  async run(argv, io) {
    const session = sessionFrom(parseArgs(argv, { session: 'value' }), io.env)
    await WaveClient.forSession(session, io).leave()
    io.out('Left the channel. This session string is finished; joining again would be a new participant.\n')
    return EXIT.ok
  },
}
