export type ColorScheme = 'light' | 'dark';
export type ThemeMode = ColorScheme | 'system';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textFaint: string;
  primary: string;
  primarySurface: string;
  /** Label colour for text/icons sitting on a `primary` fill. Never use `surface` for this. */
  onPrimary: string;
  danger: string;
  dangerBorder: string;
  dangerSurface: string;
  /** Label colour for text/icons sitting on a `danger` fill. */
  onDanger: string;
  success: string;
  successBorder: string;
  successSurface: string;
  /** Label colour for text/icons sitting on a `success` fill. */
  onSuccess: string;
  warning: string;
  warningBorder: string;
  warningSurface: string;
}

// Every foreground/background pairing below is asserted to clear WCAG AA
// (4.5:1) by `__tests__/colors.test.ts` — change a value there and the test
// tells you what it broke.
export const lightColors: ThemeColors = {
  background: '#f9fafb',
  surface: '#ffffff',
  surfaceAlt: '#f3f4f6',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
  text: '#111827',
  textMuted: '#374151',
  textSubtle: '#4b5563',
  // Off-scale on purpose: gray-500 (#6b7280) lands at 4.39:1 on `surfaceAlt`,
  // just under AA, and this token carries placeholder and meta text.
  textFaint: '#667085',
  primary: '#2563eb',
  primarySurface: '#eff6ff',
  onPrimary: '#ffffff',
  danger: '#b91c1c',
  dangerBorder: '#fecaca',
  dangerSurface: '#fef2f2',
  onDanger: '#ffffff',
  success: '#15803d',
  successBorder: '#bbf7d0',
  successSurface: '#dcfce7',
  onSuccess: '#ffffff',
  warning: '#92400e',
  warningBorder: '#fde68a',
  warningSurface: '#fef3c7',
};

export const darkColors: ThemeColors = {
  background: '#0b1120',
  surface: '#1f2937',
  surfaceAlt: '#111827',
  border: '#374151',
  borderStrong: '#4b5563',
  text: '#f9fafb',
  textMuted: '#d1d5db',
  textSubtle: '#9ca3af',
  textFaint: '#8a93a3',
  // The accent tones lighten in dark mode, so anything sitting *on* a filled
  // accent (`onPrimary`, `onDanger`) has to darken to stay readable.
  primary: '#60a5fa',
  primarySurface: '#172554',
  onPrimary: '#0b1120',
  danger: '#f87171',
  dangerBorder: '#7f1d1d',
  dangerSurface: '#3f1212',
  onDanger: '#0b1120',
  success: '#4ade80',
  successBorder: '#166534',
  successSurface: '#0f2a1a',
  onSuccess: '#0b1120',
  warning: '#fbbf24',
  warningBorder: '#78350f',
  warningSurface: '#3a2a0a',
};

export function getColorsForScheme(scheme: ColorScheme): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}
