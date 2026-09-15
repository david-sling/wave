import { ClientMark } from "./agent-marks";
import { PersonIcon } from "./icons";

/**
 * The incumbent ring scaled past the content and used as ground.
 *
 * At this size the circle stops being a diagram to read and becomes the room
 * the type is standing in — the seats sit out at the margin where the eye finds
 * them after the headline, not before it. Nothing is in the middle: a mark
 * there would make the ring a hub with the product at the centre of it, which
 * is the one thing the figure has always been drawn to avoid, and here it would
 * also be sitting under the words.
 *
 * `half` crops it to a dome, so the arc rises over the headline and the seats
 * stand on it. The strands keep their animation in both, because a ring with
 * nothing moving on it is a border.
 */
const BIG = { cx: 500, cy: 500, r: 430 } as const;

/**
 * Angles are chosen to keep every chip out of the centre column, where the
 * headline is. On the full ring that means the four seats sit near the
 * horizontal extremes; on the dome they stand on the two flanks, leaving the
 * crown of the arc clear for the type to pass under.
 */
const ringSeats = [
  { name: "Maya’s agent", under: "Claude Code", role: "agent" as const, full: 205, dome: 203 },
  { name: "Ravi’s agent", under: "Codex CLI", role: "agent" as const, full: 335, dome: 337 },
  { name: "Lena’s agent", under: "Cursor", role: "agent" as const, full: 155, dome: 186 },
  { name: "You", under: "this browser", role: "human" as const, full: 25, dome: 354 },
];

function pointOn(angle: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: BIG.cx + BIG.r * Math.cos(radians), y: BIG.cy + BIG.r * Math.sin(radians) };
}

function arc(from: number, to: number) {
  const a = pointOn(from);
  const b = pointOn(to);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${BIG.r} ${BIG.r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export function RingGround({ half = false }: { half?: boolean }) {
  const seats = ringSeats.map((seat) => ({ ...seat, angle: half ? seat.dome : seat.full }));
  // Arcs are drawn between neighbours going round, so the seats are ordered by
  // angle first. On a dome the ends do not meet, so the last pair is dropped
  // rather than sweeping a strand back across the open side.
  const inOrder = [...seats].sort((a, b) => a.angle - b.angle);
  const strands = inOrder
    .map((seat, i) => {
      const next = inOrder[(i + 1) % inOrder.length];
      if (half && i === inOrder.length - 1) return null;
      return {
        d: arc(seat.angle, next.angle),
        warm: seat.role === "human" || next.role === "human",
        back: i % 2 === 1,
        delay: [0, 1.4, 2.6, 3.4][i],
      };
    })
    .filter((strand) => strand !== null);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-1/2 -z-10 hidden aspect-square w-[112%] max-w-[64rem] -translate-x-1/2 lg:block ${
        half ? "top-[2%]" : "top-1/2 -translate-y-1/2"
      }`}
    >
      <svg viewBox="0 0 1000 1000" className="absolute inset-0 size-full" fill="none">
        {half ? (
          <path
            d={`M ${BIG.cx - BIG.r} ${BIG.cy} A ${BIG.r} ${BIG.r} 0 0 1 ${BIG.cx + BIG.r} ${BIG.cy}`}
            stroke="var(--color-line-strong)"
            strokeWidth="2"
          />
        ) : (
          <circle cx={BIG.cx} cy={BIG.cy} r={BIG.r} stroke="var(--color-line-strong)" strokeWidth="2" />
        )}

        {strands.map((strand) => (
          <path
            key={strand.d}
            className={`strand-pulse${strand.back ? " strand-pulse-back" : ""}`}
            d={strand.d}
            pathLength={100}
            stroke={strand.warm ? "var(--color-peach)" : "var(--color-sky)"}
            strokeWidth="5"
            strokeLinecap="round"
            style={{ animationDelay: `${strand.delay}s` }}
          />
        ))}
      </svg>

      {seats.map((seat) => {
        const point = pointOn(seat.angle);
        const isHuman = seat.role === "human";
        return (
          <div
            key={seat.name}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-[14px] border border-[rgba(21,22,26,0.06)] bg-panel py-1.5 pl-2 pr-3.5 shadow-soft"
            style={{ left: `${(point.x / 1000) * 100}%`, top: `${(point.y / 1000) * 100}%` }}
          >
            {/* A client's mark stands on its own the full height of the chip:
                it is a filled glyph and carries its own weight. The person is a
                stroked icon from our own set, so it keeps the peach tile —
                without a ground behind it there is nothing holding it, and the
                tile is also what says this row is the human's. */}
            {isHuman ? (
              <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-peach-soft text-peach-ink">
                <PersonIcon size={17} />
              </span>
            ) : (
              <span className="shrink-0 text-ink">
                <ClientMark client={seat.under} size={30} />
              </span>
            )}
            <span className="block">
              <span className="block whitespace-nowrap text-[13.5px] font-medium">{seat.name}</span>
              <span
                className={`block whitespace-nowrap text-[11px] leading-[1.3] text-ink-3 ${
                  isHuman ? "" : "font-mono"
                }`}
              >
                {seat.under}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
