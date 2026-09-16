import { Fragment } from "react";
import { identityColor, type IdentityColor } from "@/lib/identity-color";
import { relativeTime } from "@/lib/relative-time";
import { markOf } from "@/lib/client-marks";
import { seatingOf, type Seat } from "@/lib/seating";
import { ClientMark } from "./agent-marks";
import { MessageBody } from "./message-body";
import { ReplyAction } from "./reply-action";

export type Role = "agent" | "human";
export type Presence = "active" | "idle" | "gone";

/**
 * The item a message answers, already resolved and already cut to a line.
 *
 * The transcript is handed the quote rather than the `reply_to` seq, because
 * finding the referenced item is the job of whoever holds the channel — a
 * surface showing an example conversation has no channel to look in.
 */
export type ReplyQuote = {
  seq: number;
  /** Absent when the reply points at a system event, which has no author. */
  from?: { name: string; role: Role };
  /** One line. Cut by `quoteOf` before it gets here (lib/reply-quote.ts). */
  text: string;
};

export type TranscriptItem =
  | {
      /** Channel sequence number. Absent for illustrative transcripts. */
      seq?: number;
      type: "message";
      from: { name: string; role: Role };
      time: string;
      text: string;
      /** What this answers, when the sender set `reply_to`. */
      replyTo?: ReplyQuote;
      /** Said here but not yet handed back by the channel. Drawn dimmed until it is. */
      pending?: boolean;
    }
  | { seq?: number; type: "system"; text: string };

export type Participant = {
  name: string;
  role: Role;
  client: string;
  presence: Presence;
  /** ISO timestamp of this participant's last message, null when they have not spoken. */
  lastMessageAt?: string | null;
  /**
   * How many items of the channel this participant's client had not taken
   * delivery of at its last poll: 0 is caught up. Left out for anyone who has
   * never polled, and for yourself — your own place in the transcript is the
   * page you are looking at.
   */
  behind?: number;
};

export function PresenceDot({ presence }: { presence: Presence }) {
  const color =
    presence === "active" ? "bg-ok" : presence === "idle" ? "bg-idle" : "bg-gone";
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${color}`}
    />
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const tone =
    role === "agent" ? "bg-sky-soft text-sky-ink" : "bg-peach-soft text-peach-ink";
  return (
    <span
      className={`rounded-full px-[7px] py-px text-[12px] font-semibold leading-[1.4] tracking-[0.02em] ${tone}`}
    >
      {role}
    </span>
  );
}

/** How a name is coloured. Defaults to the standalone hash; a channel passes its palette. */
export type ColorFor = (name: string, role: Role) => IdentityColor;

/**
 * The square that ties a name in the list to the same name in the transcript.
 *
 * One rule, and `lib/seating.ts` decides which half of it applies. While a
 * participant is the only agent on their client, the tile is that client's
 * mark in its own colour, standing on the row with no tile behind it — nothing
 * else needs the hue, because no two marks in the room are alike. Once a second
 * agent joins on the same client, both fall back to the identity tile and the
 * mark steps back to a badge, which the transcript has room for and the roster
 * does not. A client with no mark is always the identity tile, which is what
 * every tile was before any of this.
 */
export function IdentityTile({
  name,
  colour,
  seat,
  big = false,
}: {
  name: string;
  colour: IdentityColor;
  seat: Seat;
  big?: boolean;
}) {
  if (seat.soloMark) {
    return (
      <span aria-hidden className={`grid place-items-center ${big ? "size-[30px]" : "size-[18px]"}`}>
        <ClientMark client={seat.client} size={big ? 21 : 14} />
      </span>
    );
  }

  const tile = (
    <span
      aria-hidden
      className={`grid place-items-center font-bold ${big ? "size-[30px] rounded-[9px] text-xs" : "size-[18px] rounded-[6px] text-[10px]"}`}
      style={{ backgroundColor: colour.fill, color: colour.ink }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );

  // The roster's tile is 18px. A badge on it would be four pixels of logo, so
  // there the client line carries the mark instead — see `LastSpoke`.
  if (!big || !seat.shared || !markOf(seat.client)) return tile;

  return (
    <span aria-hidden className="relative inline-grid">
      {tile}
      <span className="absolute -bottom-[3px] -right-[3px] grid size-[15px] place-items-center rounded-full border-2 border-panel bg-panel">
        <ClientMark client={seat.client} size={11} />
      </span>
    </span>
  );
}

/**
 * What a message answers, above the message that answers it.
 *
 * One line, quoted, and nothing more: a rendered quote keeps one stream and
 * one sequence, where a thread view would split the transcript into many and
 * fight both the resume-from-`last_seq` contract and the premise that a
 * channel is one readable conversation.
 *
 * Deliberately not a link to the item it quotes. The channel page carries its
 * invite in the URL fragment, so anything that sets `location.hash` — an
 * anchor included — throws the invite away; a jump would have to be a click
 * handler, and that would make this whole file a client component for the sake
 * of a scroll.
 */
function ReplyQuoteLine({ quote }: { quote: ReplyQuote }) {
  return (
    <div className="mb-1 flex min-w-0 items-baseline gap-1.5 border-l-2 border-line-2 pl-2 text-[12.5px] text-ink-3">
      <span aria-hidden className="shrink-0">
        &#x21B3;
      </span>
      <span className="sr-only">Replying to</span>
      {quote.from ? <b className="shrink-0 font-semibold">{quote.from.name}</b> : null}
      <span className="truncate">{quote.text}</span>
    </div>
  );
}

/** The line you had read up to. Drawn above the first item past `unreadAfter`. */
function UnreadLine() {
  return (
    <li className="hairline-accent my-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent" aria-label="New messages below">
      New
    </li>
  );
}

export function Transcript({
  items,
  animate = false,
  colorFor = identityColor,
  unreadAfter = null,
  room,
}: {
  items: TranscriptItem[];
  animate?: boolean;
  colorFor?: ColorFor;
  /** Seq the reader had reached. The divider goes before the first item past it. */
  unreadAfter?: number | null;
  /**
   * Who is in the room. Two things are questions about the whole room rather
   * than about one item — whether a tile may be its client's mark, and whether
   * an `@name` is anybody — so a surface that has a roster passes it. Without
   * one every tile is the plain identity tile and every `@name` is prose.
   */
  room?: readonly Participant[];
}) {
  const seatOf = seatingOf(room ?? []);
  // Colours resolved once, here: `MessageBody` is a client component and this
  // one is not everywhere, so what crosses that boundary has to be data.
  const mentionable = (room ?? []).map((person) => ({
    name: person.name,
    colour: colorFor(person.name, person.role),
  }));
  const firstUnread =
    unreadAfter === null ? undefined : items.find((item) => item.seq !== undefined && item.seq > unreadAfter)?.seq;
  return (
    <ol className="flex flex-col gap-3.5" aria-label="Channel transcript">
      {items.map((item, i) => {
        const motion = animate ? "arrive" : "";
        const delay = animate ? ({ ["--delay" as string]: `${60 + i * 70}ms` } as React.CSSProperties) : undefined;
        const divider = firstUnread !== undefined && item.seq === firstUnread ? <UnreadLine key="unread" /> : null;

        if (item.type === "system") {
          return (
            <Fragment key={i}>
              {divider}
            <li
              data-seq={item.seq}
              className={`hairline-between text-[12.5px] text-ink-3 ${motion}`}
              style={delay}
            >
              {item.text}
            </li>
            </Fragment>
          );
        }
        const colour = colorFor(item.from.name, item.from.role);
        return (
          <Fragment key={i}>
            {divider}
          <li
            data-seq={item.seq}
            aria-busy={item.pending || undefined}
            // A message in flight is dimmed rather than withheld, and the
            // dimming is what lifts when it lands: the same node, the same
            // place, one transition, so nothing jumps or blinks.
            className={`group -mx-3 -my-1.5 grid grid-cols-[30px_1fr] items-start gap-3 rounded-[12px] px-3 py-1.5 transition-[background-color,opacity] duration-200 hover:bg-panel-2 ${item.pending ? "opacity-55" : "opacity-100"} ${motion}`}
            style={delay}
          >
            <IdentityTile big name={item.from.name} colour={colour} seat={seatOf(item.from.name)} />
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2 text-[13px]">
                <b className="font-semibold">{item.from.name}</b>
                <RoleBadge role={item.from.role} />
                {item.pending ? (
                  <span className="text-xs text-ink-3">Sending&hellip;</span>
                ) : (
                  <time className="text-xs text-ink-3">{item.time}</time>
                )}
                {item.pending ? null : <ReplyAction seq={item.seq} author={item.from.name} />}
              </div>
              {item.replyTo ? <ReplyQuoteLine quote={item.replyTo} /> : null}
              <MessageBody text={item.text} mentions={mentionable} />
            </div>
          </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/**
 * When this participant last said something. Presence answers "is anything
 * still holding this token"; this answers "is it saying anything", which is the
 * question a person watching a channel is actually asking.
 */
function LastSpoke({ participant, seat }: { participant: Participant; seat: Seat }) {
  // Never twice in one row. The tile is already the mark whenever this
  // participant is the only one on their client, so the line says it only when
  // the tile has given it up — which in the roster is every shared client,
  // since an 18px tile has nowhere to put a badge.
  const onLine = !seat.soloMark;
  const client = participant.client ? (
    <span className="flex min-w-0 items-center gap-1">
      {onLine ? (
        <ClientMark client={participant.client} size={12} className="shrink-0 translate-y-px" />
      ) : null}
      <span className="truncate font-mono text-[11px]">{participant.client}</span>
    </span>
  ) : null;

  // The verb matters: next to a presence dot, a bare "5m ago" reads as last seen.
  const spoke =
    participant.lastMessageAt === undefined ? null : participant.lastMessageAt === null ? (
      <span className="whitespace-nowrap">hasn&rsquo;t spoken</span>
    ) : (
      <time
        dateTime={participant.lastMessageAt}
        title={`Last message: ${new Date(participant.lastMessageAt).toLocaleString()}`}
        className="whitespace-nowrap"
      >
        spoke {relativeTime(participant.lastMessageAt)}
      </time>
    );

  // Where their client's cursor was when it last asked for messages. It is
  // delivery, not attention, and it is only as current as that poll — so it is
  // said in words, at the end of the line presence and last-spoke already
  // share, rather than as a number with a precision it does not have.
  const read =
    participant.behind === undefined ? null : (
      <span
        className="whitespace-nowrap"
        title="How far their client had taken delivery when it last polled. It says the messages reached them, not that they were read."
      >
        {participant.behind === 0 ? "caught up" : `${participant.behind} behind`}
      </span>
    );

  if (!client && !spoke && !read) return null;

  const parts = [client, spoke, read].filter(Boolean);

  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-ink-3">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <span aria-hidden>·</span> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

export function Roster({
  participants,
  colorFor = identityColor,
}: {
  participants: Participant[];
  colorFor?: ColorFor;
}) {
  const seatOf = seatingOf(participants);
  return (
    <ul className="m-0 list-none p-0 text-[13px]">
      {participants.map((p) => (
        <li key={p.name} className="grid grid-cols-[18px_1fr] items-start gap-2 py-1.5">
          <span className="mt-0.5">
            <IdentityTile name={p.name} colour={colorFor(p.name, p.role)} seat={seatOf(p.name)} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              <RoleBadge role={p.role} />
              <span className="ml-auto shrink-0">
                <PresenceDot presence={p.presence} />
              </span>
            </div>
            <LastSpoke participant={p} seat={seatOf(p.name)} />
          </div>
        </li>
      ))}
    </ul>
  );
}
