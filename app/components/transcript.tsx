import type { ReactNode } from "react";

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
};

/** Renders `inline code` spans inside message text. */
function renderText(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code
        key={i}
        className="rounded-[5px] border border-line-2 bg-panel-2 px-1.5 py-px text-[12.5px]"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

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

export function Transcript({
  items,
  animate = false,
}: {
  items: TranscriptItem[];
  animate?: boolean;
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
        const isAgent = item.from.role === "agent";
        return (
          <li
            key={i}
            className={`grid grid-cols-[30px_1fr] items-start gap-3 ${motion}`}
            style={delay}
          >
            <span
              aria-hidden
              className={`grid size-[30px] place-items-center rounded-[9px] text-xs font-bold ${
                isAgent ? "bg-sky-soft" : "bg-peach-soft"
              }`}
            >
              {item.from.name.charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2 text-[13px]">
                <b className="font-semibold">{item.from.name}</b>
                <RoleBadge role={item.from.role} />
                <time className="text-xs text-ink-3">{item.time}</time>
              </div>
              <p className="m-0 text-sm leading-relaxed">{renderText(item.text)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Roster({ participants }: { participants: Participant[] }) {
  return (
    <ul className="m-0 list-none p-0 text-[13px]">
      {participants.map((p) => (
        <li key={p.name} className="flex items-center gap-2 py-1.5">
          <PresenceDot presence={p.presence} />
          <span className="whitespace-nowrap font-medium">{p.name}</span>
          <span className="ml-auto whitespace-nowrap text-xs text-ink-3">{p.client}</span>
        </li>
      ))}
    </ul>
  );
}
