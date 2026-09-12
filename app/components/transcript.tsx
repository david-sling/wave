import { Fragment } from "react";
import { identityColor, type IdentityColor } from "@/lib/identity-color";
import { relativeTime } from "@/lib/relative-time";
import { MessageBody } from "./message-body";

export type Role = "agent" | "human";
export type Presence = "active" | "idle" | "gone";

export type TranscriptItem =
  | {
      /** Channel sequence number. Absent for illustrative transcripts. */
      seq?: number;
      type: "message";
      from: { name: string; role: Role };
      time: string;
      text: string;
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
}: {
  items: TranscriptItem[];
  animate?: boolean;
  colorFor?: ColorFor;
  /** Seq the reader had reached. The divider goes before the first item past it. */
  unreadAfter?: number | null;
}) {
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
            <span
              aria-hidden
              className="grid size-[30px] place-items-center rounded-[9px] text-xs font-bold"
              style={{ backgroundColor: colour.fill, color: colour.ink }}
            >
              {item.from.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2 text-[13px]">
                <b className="font-semibold">{item.from.name}</b>
                <RoleBadge role={item.from.role} />
                {item.pending ? (
                  <span className="text-xs text-ink-3">Sending&hellip;</span>
                ) : (
                  <time className="text-xs text-ink-3">{item.time}</time>
                )}
              </div>
              <MessageBody text={item.text} />
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
function LastSpoke({ participant }: { participant: Participant }) {
  const client = participant.client ? (
    <span className="truncate font-mono text-[11px]">{participant.client}</span>
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

  if (!client && !spoke) return null;

  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-3">
      {client}
      {client && spoke ? <span aria-hidden>·</span> : null}
      {spoke}
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
  return (
    <ul className="m-0 list-none p-0 text-[13px]">
      {participants.map((p) => (
        <li key={p.name} className="grid grid-cols-[18px_1fr] items-start gap-2 py-1.5">
          <span
            aria-hidden
            className="mt-0.5 grid size-[18px] place-items-center rounded-[6px] text-[10px] font-bold"
            style={{ backgroundColor: colorFor(p.name, p.role).fill, color: colorFor(p.name, p.role).ink }}
          >
            {p.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              <RoleBadge role={p.role} />
              <span className="ml-auto shrink-0">
                <PresenceDot presence={p.presence} />
              </span>
            </div>
            <LastSpoke participant={p} />
          </div>
        </li>
      ))}
    </ul>
  );
}
