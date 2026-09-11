import type { ApplicationStatus } from '../types';
import type { ThemeColors } from '../../../theme/colors';

export interface StatusColor {
  /** Pill background, for `StatusBadge`. */
  bg: string;
  /** Pill text and the dot/heading tint everywhere else. */
  fg: string;
}

/**
 * One colour per status, shared by `StatusBadge`, `StatusFilterButton`, and
 * `BoardScreen` so a status never shows a different colour depending on
 * which screen you're looking at.
 */
export function statusColors(colors: ThemeColors): Record<ApplicationStatus, StatusColor> {
  return {
    draft: { bg: colors.surfaceAlt, fg: colors.textMuted },
    applied: { bg: colors.primarySurface, fg: colors.primary },
    interviewing: { bg: colors.warningSurface, fg: colors.warning },
    offered: { bg: colors.successSurface, fg: colors.success },
    accepted: { bg: colors.success, fg: colors.onSuccess },
    rejected: { bg: colors.dangerSurface, fg: colors.danger },
    withdrawn: { bg: colors.border, fg: colors.textSubtle },
  };
}

/**
 * Solid swatch for the dot/heading that precedes a status label.
 *
 * Distinct from `statusColors()`'s pill `fg`: `accepted`'s pill is a filled
 * `success` background with `onSuccess` (white) text, which would render as
 * an invisible dot against the app's background. This maps every status to
 * its identifying tone instead — `success` for both `offered` and
 * `accepted`, matching `StatusBadge`'s existing green-family palette for
 * each.
 */
export function statusDotColor(status: ApplicationStatus, colors: ThemeColors): string {
  const tones: Record<ApplicationStatus, string> = {
    draft: colors.textMuted,
    applied: colors.primary,
    interviewing: colors.warning,
    offered: colors.success,
    accepted: colors.success,
    rejected: colors.danger,
    withdrawn: colors.textSubtle,
  };
  return tones[status];
}
