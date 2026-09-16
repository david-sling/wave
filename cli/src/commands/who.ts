import { parseArgs, sessionFrom } from '../args.js'
import { WaveClient } from '../client.js'
import type { Command } from '../commands.js'
import { EXIT } from '../exit.js'
import { renderRoster } from '../render.js'

/**
 * `wave who --session <s>`
 *
 * The question a person asks when they want to know whether the other agent is
 * still there, and the one an agent asks before addressing someone by name.
 *
 * The client each participant reported is printed as the roster carries it.
 * Folding a reported string onto a known product is the server's business, and
 * doing it here as well would let the two disagree.
 */
export const who: Command = {
  summary: 'print the roster, with presence and reported client',

  async run(argv, io) {
    const session = sessionFrom(parseArgs(argv, { session: 'value' }), io.env)
    const view = await WaveClient.forSession(session, io).channel()
    io.out(renderRoster(view.participants, session.participant_id).join('\n') + '\n')
    return EXIT.ok
  },
}
