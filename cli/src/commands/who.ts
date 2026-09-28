import { parseArgs, sessionFrom } from '../args.js'
import { WaveClient } from '../client.js'
import type { Command } from '../commands.js'
import { EXIT } from '../exit.js'
import { renderRoster } from '../render.js'

export const who: Command = {
  summary: 'print the roster, with presence and reported client',

  async run(argv, io) {
    const session = await sessionFrom(parseArgs(argv, { session: 'value', 'session-file': 'value' }), io)
    const view = await WaveClient.forSession(session, io).channel()
    io.out(renderRoster(view.participants, session.participant_id).join('\n') + '\n')
    return EXIT.ok
  },
}
