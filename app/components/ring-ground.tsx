import type { CSSProperties } from 'react'
import { ClientMark } from './agent-marks'
import { PersonIcon } from './icons'

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
const BIG = { cx: 500, cy: 500, r: 430 } as const

/**
 * Angles are chosen to keep every chip out of the centre column, where the
 * headline is. On the full ring that means the four seats sit near the
 * horizontal extremes; on the dome they stand on the two flanks, leaving the
 * crown of the arc clear for the type to pass under.
 *
 * On a phone the copy fills the width, so the full ring is drawn wider than
 * the screen and the seats (marks only) move to `phone`: two above the
 * headline and two below the form, where there is room for them.
 *
 * `even` is where each seat starts on the full ring as it opens on arrival: the
 * four quarters, each 20 degrees from where it settles on either screen, so the
 * ring opens evenly set and the seats slide to their places as it does.
 */
const ringSeats = [
  { name: 'Maya’s agent', under: 'Claude Code', role: 'agent' as const, full: 205, phone: 245, even: 225, dome: 203 },
  { name: 'Ravi’s agent', under: 'Codex CLI', role: 'agent' as const, full: 335, phone: 295, even: 315, dome: 337 },
  { name: 'Lena’s agent', under: 'Cursor', role: 'agent' as const, full: 155, phone: 115, even: 135, dome: 186 },
  { name: 'You', under: 'this browser', role: 'human' as const, full: 25, phone: 65, even: 45, dome: 354 },
]

type Seat = (typeof ringSeats)[number]

/**
 * Arcs are drawn between neighbours going round, so the seats are ordered by
 * angle first. On a dome the ends do not meet, so the last pair is dropped
 * rather than sweeping a strand back across the open side.
 */
function strandsFor(angleOf: (seat: Seat) => number, open: boolean) {
  const inOrder = [...ringSeats].sort((a, b) => angleOf(a) - angleOf(b))
  return inOrder
    .map((seat, i) => {
      const next = inOrder[(i + 1) % inOrder.length]
      if (open && i === inOrder.length - 1) return null
      return {
        d: arc(angleOf(seat), angleOf(next)),
        warm: seat.role === 'human' || next.role === 'human',
        back: i % 2 === 1,
        delay: [0, 1.4, 2.6, 3.4][i],
      }
    })
    .filter((strand) => strand !== null)
}

function pointOn(angle: number) {
  const radians = (angle * Math.PI) / 180
  return { x: BIG.cx + BIG.r * Math.cos(radians), y: BIG.cy + BIG.r * Math.sin(radians) }
}

function arc(from: number, to: number) {
  const a = pointOn(from)
  const b = pointOn(to)
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${BIG.r} ${BIG.r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
}

export function RingGround({ half = false }: { half?: boolean }) {
  // The dome has one layout; the full ring has a wide one and a phone one,
  // each with its own strands, shown at its own size.
  const layouts = half
    ? [{ strands: strandsFor((seat) => seat.dome, true), className: '' }]
    : [
        { strands: strandsFor((seat) => seat.full, false), className: 'max-lg:hidden' },
        { strands: strandsFor((seat) => seat.phone, false), className: 'lg:hidden' },
      ]

  return (
    <div
      aria-hidden
      data-ring
      className={`pointer-events-none absolute left-1/2 -z-10 aspect-square w-[170vw] max-w-[64rem] -translate-x-1/2 lg:w-[112%] ${
        half ? 'top-[2%]' : 'top-1/2 -translate-y-1/2'
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

        {layouts.map((layout) => (
          <g key={layout.className} className={layout.className}>
            {layout.strands.map((strand) => (
              <path
                key={strand.d}
                className={`strand-pulse${strand.back ? ' strand-pulse-back' : ''}`}
                d={strand.d}
                pathLength={100}
                stroke={strand.warm ? 'var(--color-peach)' : 'var(--color-sky)'}
                strokeWidth="5"
                strokeLinecap="round"
                style={{ animationDelay: `${strand.delay}s` }}
              />
            ))}
          </g>
        ))}
      </svg>

      {ringSeats.map((seat) => {
        // Placed by the `[data-seat]` rule in globals.css, which picks the home
        // angle for the screen and slides in from `even` as the ring opens.
        const angles = half
          ? { '--home-wide': `${seat.dome}deg`, '--home-phone': `${seat.dome}deg`, '--even': `${seat.dome}deg` }
          : { '--home-wide': `${seat.full}deg`, '--home-phone': `${seat.phone}deg`, '--even': `${seat.even}deg` }
        const isHuman = seat.role === 'human'
        return (
          <div
            key={seat.name}
            data-seat
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-[14px] border border-[rgba(21,22,26,0.06)] bg-panel p-1.5 shadow-soft lg:pl-2 lg:pr-3.5"
            style={angles as CSSProperties}
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
            <span className="block max-lg:hidden">
              <span className="block whitespace-nowrap text-[13.5px] font-medium">{seat.name}</span>
              <span
                className={`block whitespace-nowrap text-[11px] leading-[1.3] text-ink-3 ${isHuman ? '' : 'font-mono'}`}
              >
                {seat.under}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
