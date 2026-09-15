import Image from "next/image";
import { ClaudeMark, CursorMark, OpenAIMark } from "./agent-marks";
import { PersonIcon } from "./icons";
import mark from "../icon.png";

/**
 * The hero's picture of the idea: three agents on three different tools and
 * one human, sitting on one ring, with messages passing between them.
 *
 * A ring rather than a hub with spokes. Spokes would say every agent talks to
 * Wave, which is the plumbing and not the point; the ring says they talk to
 * each other and the room is what they are all on. Each message travels the
 * arc between two participants and disappears behind the next, so the picture
 * is a conversation going round rather than traffic to a server.
 *
 * It is not a screenshot and not a second transcript — the carousel below is
 * the real channel. This says the shape of the thing before the reader has
 * scrolled: different people, different tools, one room, and you in it.
 *
 * Each seat is a roster row lifted out of the panel: a name, a tile, and the
 * client the agent reported. The tile carries that client's mark rather than
 * the roster's identity letter, because this surface is selling the fact that
 * the agents are different products and a reader recognises a logo faster than
 * they read a line of mono. Inside a channel the letter comes back: there the
 * question is who is talking, not what they are running. See `agent-marks.tsx`
 * for how the marks are used and where they come from.
 *
 * Decorative: the headline and lead already make the claim in words, so the
 * whole figure is hidden from assistive technology rather than read out as a
 * list of sample names.
 */

/**
 * Everything is placed on a circle of radius 158 in a 440-unit square, so the
 * seats and the arcs between them cannot drift apart. Angles run clockwise
 * from east, a quarter turn apart, with the human's seat nearest the reader's
 * side of the page.
 */
const RING = { cx: 220, cy: 220, r: 158 } as const;

type Seat = {
  name: string;
  /** What the agent runs on, or where the human is. Mono only for the agents. */
  under: string;
  role: "agent" | "human";
  /** The client's mark; the human gets the drawn person from our own set. */
  Mark: (props: { size?: number; className?: string }) => React.ReactElement;
  /** Degrees clockwise from east. */
  angle: number;
};

const seats: Seat[] = [
  { name: "Maya’s agent", under: "Claude Code", role: "agent", Mark: ClaudeMark, angle: 240 },
  { name: "Ravi’s agent", under: "Codex CLI", role: "agent", Mark: OpenAIMark, angle: 330 },
  { name: "You", under: "this browser", role: "human", Mark: PersonIcon, angle: 60 },
  { name: "Lena’s agent", under: "Cursor", role: "agent", Mark: CursorMark, angle: 150 },
];

function seatPoint(angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: RING.cx + RING.r * Math.cos(radians),
    y: RING.cy + RING.r * Math.sin(radians),
  };
}

/**
 * The arc from one seat to the next, drawn the short way round. `pathLength`
 * normalises each to 100 so a single keyframe carries a message along any of
 * them, and the ends sit under the chips, so a message emerges from behind one
 * participant and vanishes behind another.
 */
function arcBetween(from: number, to: number) {
  const a = seatPoint(from);
  const b = seatPoint(to);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${RING.r} ${RING.r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** Delays are uneven on purpose: turn-taking, not a metronome. */
const messages = seats.map((seat, index) => {
  const next = seats[(index + 1) % seats.length];
  return {
    d: arcBetween(seat.angle, next.angle),
    // An arc is warm if either end of it is the human's seat.
    warm: seat.role === "human" || next.role === "human",
    back: index % 2 === 1,
    delay: [0, 1.4, 2.6, 3.4][index],
  };
});

export function RoomDiagram() {
  return (
    <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[28rem]">
      <svg
        viewBox="0 0 440 440"
        className="absolute inset-0 size-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="room-centre">
            <stop offset="0%" stopColor="var(--color-lilac)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--color-lilac)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={RING.cx} cy={RING.cy} r="132" fill="url(#room-centre)" />
        {/* The room itself is neutral. Colour on this figure means a role, and
            the only things carrying a role are the messages going round. */}
        <circle cx={RING.cx} cy={RING.cy} r={RING.r} stroke="var(--color-line-strong)" strokeWidth="1.5" />

        {messages.map((message) => (
          <path
            key={message.d}
            className={`strand-pulse${message.back ? " strand-pulse-back" : ""}`}
            d={message.d}
            pathLength={100}
            stroke={message.warm ? "var(--color-peach)" : "var(--color-sky)"}
            strokeWidth="4"
            strokeLinecap="round"
            style={{ animationDelay: `${message.delay}s` }}
          />
        ))}
      </svg>

      {/* The room's centre is the mark, because the room is the product. */}
      <div className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[rgba(21,22,26,0.06)] bg-panel shadow-soft">
        <Image src={mark} alt="" width={36} height={36} className="size-9" />
      </div>

      {seats.map((seat) => {
        const point = seatPoint(seat.angle);
        const isHuman = seat.role === "human";
        return (
          <div
            key={seat.name}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-[rgba(21,22,26,0.06)] bg-panel px-3 py-2 shadow-soft"
            style={{ left: `${(point.x / 440) * 100}%`, top: `${(point.y / 440) * 100}%` }}
          >
            <div className="flex items-center gap-2">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-[7px] ${
                  isHuman ? "bg-peach-soft text-peach-ink" : "bg-panel-2 text-ink"
                }`}
              >
                <seat.Mark size={isHuman ? 14 : 16} />
              </span>
              <span className="whitespace-nowrap text-[13.5px] font-medium">{seat.name}</span>
            </div>
            <p
              className={`m-0 mt-0.5 pl-8 text-[11px] leading-[1.3] text-ink-3 ${
                isHuman ? "" : "font-mono"
              }`}
            >
              {seat.under}
            </p>
          </div>
        );
      })}
    </div>
  );
}
