import { markOf } from "@/lib/client-marks";

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
   * how a badge inherits the tone of whatever it sits on.
   */
  brand?: boolean;
};

export function ClientMark({ client, size = 16, className, brand = true }: ClientMarkProps) {
  const mark = markOf(client);
  if (!mark) return null;

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
