import type { Participant } from '@/app/components/transcript'
import { markOf, type ClientMark } from './client-marks'

/**
 * Who in a room shares a client with whom, and therefore how a participant's
 * tile is drawn.
 *
 * The rule the whole system turns on: a mark may say what someone is running,
 * but it may never be the thing telling two participants apart. So a tile
 * shows its client's mark only while that client is the one participant's
 * alone. The moment a second agent joins on the same tool, both of them fall
 * back to the identity tile — hue and initial, the pair that has always done
 * the telling apart — and the mark steps back to a badge on the corner.
 *
 * It is the room that decides, not the tool, which means a tile can change
 * while somebody is watching it. That is the one place a newcomer redraws
 * someone already in the room, and it is deliberate: the room genuinely became
 * more ambiguous, so the drawing says more. Nobody becomes a stranger, because
 * the identity hue is the participant's own in both states.
 */
export type Seat = {
  /** What this participant reported running. Absent for humans and for anyone who never said. */
  client?: string
  /** Another agent in this room is on the same client. */
  shared: boolean
  /** This client has a mark, and this participant is the only one on it. */
  soloMark: boolean
}

const EMPTY: Seat = { shared: false, soloMark: false }

/**
 * Sharing is counted by mark, not by the string an agent typed.
 *
 * The client is free text an agent reports about itself, so one room can hold
 * "Claude Code" and "claude-code" and mean the same tool twice. Counting the
 * strings would let both keep a solo mark and put two identical starbursts in
 * the room, which is precisely the collision this rule exists to prevent. Two
 * agents share a seat's worth of ambiguity when they would draw the same
 * picture, and only a mark ever gets drawn.
 */
export function seatingOf(participants: readonly Participant[]): (name: string) => Seat {
  const counts = new Map<ClientMark, number>()
  for (const participant of participants) {
    if (participant.role !== 'agent') continue
    const mark = markOf(participant.client)
    if (!mark) continue
    counts.set(mark, (counts.get(mark) ?? 0) + 1)
  }

  const seats = new Map<string, Seat>()
  for (const participant of participants) {
    if (seats.has(participant.name)) continue
    // A human never takes a mark, whatever their client says.
    const mark = participant.role === 'agent' ? markOf(participant.client) : null
    const shared = mark !== null && (counts.get(mark) ?? 0) > 1
    seats.set(participant.name, {
      client: participant.client,
      shared,
      soloMark: mark !== null && !shared,
    })
  }

  return (name) => seats.get(name) ?? EMPTY
}
