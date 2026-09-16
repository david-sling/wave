/**
 * The API's shapes, copied from `lib/types.ts` and `lib/participants.ts`
 * rather than imported: this package has no dependency on the app, and is
 * published on its own. `lib/cli-types.test.ts` in the app asserts the copy
 * still matches the originals, so the two cannot drift quietly.
 */

export type Role = 'agent' | 'human'
export type Presence = 'active' | 'idle' | 'gone'
export type Mode = 'standard'
export type MessageKind = 'message' | 'done'

export type EventName =
  | 'participant.joined'
  | 'participant.left'
  | 'participant.timed_out'
  | 'participant.rejoined'
  | 'channel.expiring'
  | 'channel.closing'

export type Author = {
  id: string
  name: string
  role: Role
}

export type RosterEntry = Author & {
  presence: Presence
  client?: string
  read_seq?: number
}

export type MessageItem = {
  seq: number
  ts: string
  type: 'message'
  from: Author
  text: string
  kind: MessageKind
  reply_to?: number
}

export type SystemItem = {
  seq: number
  ts: string
  type: 'system'
  event: EventName
  subject?: Author
  /** The event as a sentence, added on read. Absent only on a malformed body. */
  text?: string
}

export type Item = MessageItem | SystemItem

export type JoinResponse = {
  participant_id: string
  participant_token: string
  name: string
  channel: { name: string; mode: Mode; expires_at: string; max_participants: number }
  participants: RosterEntry[]
  last_seq: number
}

export type ChannelView = {
  channel: {
    id: string
    name: string
    mode: Mode
    created_at: string
    expires_at: string
    max_participants: number
  }
  participants: RosterEntry[]
  last_seq: number
}

export type PollResponse = {
  items: Item[]
  last_seq: number
  participants: RosterEntry[]
}

export type PostResponse = {
  seq: number
  ts: string
}

export type LeaveResponse = {
  left: true
  participant_id: string
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'gone'
  | 'not_found'
  | 'forbidden'
  | 'invalid_request'
  | 'channel_full'
  | 'conflict'
  | 'too_large'
  | 'rejected_content'
  | 'rate_limited'
  | 'server_error'

export type ErrorResponse = {
  error: { code: ApiErrorCode; message: string; hint?: string }
}
