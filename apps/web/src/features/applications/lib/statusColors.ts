import type { BadgeTone } from '@trakwyn/ui';
import type { ApplicationStatus } from '#/graphql/generated/graphql';

/**
 * Every application status, in the order a pipeline actually moves through.
 * The board renders its columns in this order and every status picker lists
 * them in it, so the two never disagree about sequence.
 */
export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'draft',
  'applied',
  'interviewing',
  'offered',
  'accepted',
  'rejected',
  'withdrawn',
];

export interface StatusColor {
  /** Pill tone, for `Badge`/`StatusBadge`. */
  tone: BadgeTone;
  /** Solid swatch, for the dot that precedes a status label. */
  dot: string;
  /** Top rule on a board column. */
  columnBorder: string;
  /** Column heading text, tinted to match its rule. */
  columnHeading: string;
}

/**
 * One colour per status, for the whole web app.
 *
 * Before this existed the board and `StatusBadge` each carried their own map
 * and disagreed on three of the seven: interviewing was purple on the board
 * and yellow in a badge, offered orange and green, accepted green and
 * emerald. The same application therefore changed colour depending on which
 * screen you were looking at. Anything that colours a status reads this map,
 * so there is one place to change and nowhere for a second opinion to live.
 *
 * Colour is never the only cue — every surface using these also shows the
 * localized status text.
 */
export const STATUS_COLORS: Record<ApplicationStatus, StatusColor> = {
  draft: {
    tone: 'gray',
    dot: 'bg-gray-400',
    columnBorder: 'border-t-gray-400',
    columnHeading: 'text-gray-600 dark:text-gray-300',
  },
  applied: {
    tone: 'blue',
    dot: 'bg-blue-500',
    columnBorder: 'border-t-blue-500',
    columnHeading: 'text-blue-700 dark:text-blue-400',
  },
  interviewing: {
    tone: 'purple',
    dot: 'bg-purple-500',
    columnBorder: 'border-t-purple-500',
    columnHeading: 'text-purple-700 dark:text-purple-400',
  },
  offered: {
    tone: 'orange',
    dot: 'bg-orange-500',
    columnBorder: 'border-t-orange-500',
    columnHeading: 'text-orange-700 dark:text-orange-400',
  },
  accepted: {
    tone: 'green',
    dot: 'bg-green-500',
    columnBorder: 'border-t-green-500',
    columnHeading: 'text-green-700 dark:text-green-400',
  },
  rejected: {
    tone: 'red',
    dot: 'bg-red-500',
    columnBorder: 'border-t-red-500',
    columnHeading: 'text-red-700 dark:text-red-400',
  },
  withdrawn: {
    tone: 'slate',
    dot: 'bg-slate-400',
    columnBorder: 'border-t-slate-400',
    columnHeading: 'text-slate-600 dark:text-slate-400',
  },
};

const FALLBACK: StatusColor = {
  tone: 'gray',
  dot: 'bg-gray-400',
  columnBorder: 'border-t-gray-400',
  columnHeading: 'text-gray-600 dark:text-gray-300',
};

/**
 * Colours for a status that arrived as a bare string — a URL search param, or
 * a value from an API version this build predates. Unknown statuses render
 * neutral rather than uncoloured, so nothing loses its dot or its border.
 */
export function statusColor(status: string): StatusColor {
  return STATUS_COLORS[status as ApplicationStatus] ?? FALLBACK;
}
