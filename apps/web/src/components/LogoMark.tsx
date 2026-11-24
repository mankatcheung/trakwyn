interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * The colour is carried on the SVG element and inherited by both strokes via
 * `currentColor`, so the mark follows the theme.
 *
 * Blue-700 is the brand blue and stays the brand blue in light mode; dark mode
 * lifts to blue-400 because blue-700 on `stone-900` sits too close to its own
 * background to read. Written as a literal so Tailwind's scanner emits both
 * utilities.
 */
const MARK_COLOR = 'text-blue-700 dark:text-blue-400';

/**
 * Trakwyn's mark: two chevrons, the leading one solid and the trailing one a
 * hairline of the same shape — a position and the position it came from, which
 * is what the board tracks.
 *
 * The weights are deliberately unequal. Two chevrons at the same weight read as
 * a media control ("fast forward"); a thing and its shadow do not, and the
 * difference survives being shrunk.
 *
 * The square assets (favicon, app icon, extension) are white on the blue tile
 * and so have no theme to follow — this is the only place the mark changes
 * colour.
 */
export function LogoMark({ size = 24, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className ? `${MARK_COLOR} ${className}` : MARK_COLOR}
      aria-hidden="true"
    >
      <path
        d="M11.5 13 L23.5 24 L11.5 35"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path
        d="M24.5 13 L36.5 24 L24.5 35"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
