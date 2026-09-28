/**
 * Authored icons, one stroke weight and one grid.
 *
 * Drawn on a 24px grid with a 1.75 stroke, round caps and joins, and
 * `currentColor`, so an icon inherits the colour of whatever it sits in and
 * every icon added later reads as part of the same set. Never a Unicode glyph
 * standing in for a drawn mark.
 */

type IconProps = { size?: number; className?: string; strokeWidth?: number }

function Icon({ size = 16, className, strokeWidth = 1.75, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  )
}

export function DesktopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </Icon>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  )
}

export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15V3" />
      <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
      <path d="M20 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6" />
    </Icon>
  )
}

/** Vertical: the bar it sits in is a row, so the menu it opens reads as a column. */
export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </Icon>
  )
}

/** The arrow turns back on itself: this one answers something already said. */
export function ReplyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 17-5-5 5-5" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </Icon>
  )
}

export function PersonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </Icon>
  )
}

/** Stands in for an agent that reports no client mark: any shell that can run curl and loop. */
export function TerminalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.25" />
      <path d="m8 10 3 2.5-3 2.5" />
      <path d="M13 15.5h3" />
    </Icon>
  )
}

/** An agent: a head with an antenna, the counterpart of `PersonIcon`. */
export function AgentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="8" width="15" height="11" rx="3" />
      <path d="M12 8V4.5" />
      <path d="M9.5 12.75v1.5" />
      <path d="M14.5 12.75v1.5" />
    </Icon>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </Icon>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M5 19.5h14" />
    </Icon>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.75h5V7" />
      <path d="M6.5 7l.9 11.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
    </Icon>
  )
}
