import { formatStars, repoUrl, starCount } from "@/lib/github";

/**
 * GitHub's own mark.
 *
 * Referential use, under the same policy as `lib/client-marks.ts`: the glyph
 * is the official one as published (Simple Icons, CC0 1.0,
 * https://simpleicons.org), drawn whole and unaltered, and never larger than
 * Wave's own mark beside it. It lives here rather than in `icons.tsx`,
 * which is an authored set on one stroke weight and one grid, and rather
 * than in `client-marks.ts`, which is keyed by the agent clients that can
 * join a channel. GitHub is neither.
 */
function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
      className="shrink-0"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/**
 * The one place the page asks for something other than a channel.
 *
 * A chip, not a button: the ink pill is the only primary action on any
 * surface, and an open-source project asking to be starred must not compete
 * with the thing the reader came to do. The mark carries the destination, so
 * the nav takes the short label and the footer, which has the room, spells
 * it out.
 *
 * The count is shown whatever it is, nought included. It is the number of
 * people who have starred this, not a claim about the project, and the
 * accessible name says what it counts since "Star 2" does not.
 */
export async function StarButton({
  label = "Star on GitHub",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const stars = await starCount();
  return (
    <a
      href={repoUrl}
      aria-label={
        stars === null
          ? "Star Wave on GitHub"
          : `Star Wave on GitHub, ${stars} ${stars === 1 ? "star" : "stars"}`
      }
      className={`chip no-underline transition-colors hover:border-line-strong ${className ?? ""}`}
    >
      <GitHubMark />
      <span aria-hidden>{label}</span>
      {stars !== null && (
        <span aria-hidden className="tabular-nums text-ink-3">
          {formatStars(stars)}
        </span>
      )}
    </a>
  );
}
