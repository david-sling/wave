import { useId } from "react";
import { ANTIGRAVITY_COLOR, markOf } from "@/lib/client-marks";

/**
 * A client's mark, drawn for the browser.
 *
 * The geometry, the sources it came from and the colour policy all live in
 * `lib/client-marks.ts`, because the share cards draw the same marks through
 * Satori and must not be working from a second copy. This file is only the
 * React end of it.
 */

export type ClientMarkProps = {
  client?: string;
  size?: number;
  className?: string;
  /**
   * Draw the mark in its own colour. Off, it takes `currentColor`, which is
   * how a badge inherits the tone of whatever it sits on. Antigravity has no
   * `currentColor` form of its aurora, so this still falls back to its flat
   * ink glyph when off.
   */
  brand?: boolean;
};

export function ClientMark({ client, size = 16, className, brand = true }: ClientMarkProps) {
  // useId must run every render regardless of which branch below uses it.
  const uid = useId();
  const mark = markOf(client);
  if (!mark) return null;

  if (brand && client?.trim().toLowerCase().startsWith("antigravity")) {
    return <AntigravityColorMark size={size} className={className} uid={uid} />;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={brand ? mark.brand : "currentColor"}
      fillRule={mark.fillRule}
      aria-hidden
      focusable="false"
      className={className}
    >
      <path d={mark.d} />
    </svg>
  );
}

/**
 * Antigravity's mark in its own aurora colours: the outline masks eleven
 * blurred, coloured blobs (`ANTIGRAVITY_COLOR`, sourced from Lobe Icons).
 *
 * The mask and every blob's filter need an id, and the marquee this mark
 * appears in draws several copies on one page — a hard-coded id would make
 * every copy after the first reference the first copy's (invisible, hidden)
 * definitions instead of its own. `uid`, from the caller's `useId`, keeps
 * each instance's ids to itself.
 */
function AntigravityColorMark({ size, className, uid }: { size: number; className?: string; uid: string }) {
  const maskId = `${uid}-antigravity-mask`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={className}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="1" width="24" height="23">
        <path d={ANTIGRAVITY_COLOR.mask} fill="#fff" />
      </mask>
      <g mask={`url(#${maskId})`}>
        {ANTIGRAVITY_COLOR.blobs.map((blob, i) => (
          <g key={i} filter={`url(#${uid}-antigravity-blur-${i})`}>
            <path d={blob.d} fill={blob.fill} />
          </g>
        ))}
      </g>
      <defs>
        {ANTIGRAVITY_COLOR.blobs.map((blob, i) => (
          <filter
            key={i}
            id={`${uid}-antigravity-blur-${i}`}
            colorInterpolationFilters="sRGB"
            filterUnits="userSpaceOnUse"
            x={blob.x}
            y={blob.y}
            width={blob.width}
            height={blob.height}
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <feGaussianBlur stdDeviation={blob.blur} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
