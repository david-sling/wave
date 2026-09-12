import { identityColor, type IdentityColor } from "@/lib/identity-color";
import { relativeTime } from "@/lib/relative-time";
import { MessageBody } from "./message-body";

export type Role = "agent" | "human";
export type Presence = "active" | "idle" | "gone";

export type TranscriptItem =
  | {
      type: "message";
      from: { name: string; role: Role };
      time: string;
      text: string;
    }
  | { type: "system"; text: string };

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

export function Transcript({
  items,
  animate = false,
  colorFor = identityColor,
}: {
  items: TranscriptItem[];
  animate?: boolean;
  colorFor?: ColorFor;
}) {
  return (
    <ol className="flex flex-col gap-3.5" aria-label="Channel transcript">
      {items.map((item, i) => {
        const motion = animate ? "arrive" : "";
        const delay = animate ? ({ ["--delay" as string]: `${60 + i * 70}ms` } as React.CSSProperties) : undefined;
        if (item.type === "system") {
          return (
            <li
              key={i}
              className={`hairline-between text-[12.5px] text-ink-3 ${motion}`}
              style={delay}
            >
              {item.text}
            </li>
          );
        }
        const colour = colorFor(item.from.name, item.from.role);
        return (
          <li
            key={i}
            className={`group -mx-3 -my-1.5 grid grid-cols-[30px_1fr] items-start gap-3 rounded-[12px] px-3 py-1.5 transition-colors hover:bg-panel-2 ${motion}`}
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
                <time className="text-xs text-ink-3">{item.time}</time>
              </div>
              <MessageBody text={item.text} />
            </div>
          </li>
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
  if (participant.lastMessageAt === undefined) {
    return participant.client ? (
      <span className="whitespace-nowrap text-xs text-ink-3">{participant.client}</span>
    ) : null;
  }

  if (participant.lastMessageAt === null) {
    return <span className="whitespace-nowrap text-xs text-ink-3">hasn&rsquo;t spoken</span>;
  }

  // The verb matters: next to a presence dot, a bare "5m ago" reads as last seen.
  return (
    <time
      dateTime={participant.lastMessageAt}
      title={`Last message: ${new Date(participant.lastMessageAt).toLocaleString()}`}
      className="whitespace-nowrap text-xs text-ink-3"
    >
      spoke {relativeTime(participant.lastMessageAt)}
    </time>
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
        <li key={p.name} className="flex items-center gap-2 py-1.5">
          <span
            aria-hidden
            className="grid size-[18px] shrink-0 place-items-center rounded-[6px] text-[10px] font-bold"
            style={{ backgroundColor: colorFor(p.name, p.role).fill, color: colorFor(p.name, p.role).ink }}
          >
            {p.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 truncate font-medium">{p.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <LastSpoke participant={p} />
            <PresenceDot presence={p.presence} />
          </span>
        </li>
      ))}
    </ul>
  );
}
