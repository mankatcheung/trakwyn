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

// Neutrals and the accent mirror the web tokens (JEF-670/671: warm stone ramp,
// ink-blue accent). The dark `primary` is a lighter accent blue (#8bbcfb)
// rather than the web's #1d4ed8 fill, because one token serves as both text
// and fill here and #8bbcfb passes AA as text on the dark surfaces.
// Every foreground/background pairing below is asserted to clear WCAG AA
// (4.5:1) by `__tests__/colors.test.ts` — change a value there and the test
// tells you what it broke.
export const lightColors: ThemeColors = {
  background: '#fafaf9',
  surface: '#ffffff',
  surfaceAlt: '#f5f5f4',
  border: '#e7e5e4',
  borderStrong: '#d6d3d1',
  text: '#1c1917',
  textMuted: '#44403c',
  textSubtle: '#57534e',
  // Off-scale on purpose: stone-500 (#78716c) lands at 4.39:1 on `surfaceAlt`,
  // just under AA, and this token carries placeholder and meta text.
  textFaint: '#6b6560',
  primary: '#1e40af',
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
  background: '#1c1917',
  surface: '#292524',
  surfaceAlt: '#44403c',
  border: '#57534e',
  borderStrong: '#78716c',
  text: '#fafaf9',
  textMuted: '#e7e5e4',
  textSubtle: '#cdc8c4',
  textFaint: '#b5afaa',
  // The accent tones lighten in dark mode, so anything sitting *on* a filled
  // accent (`onPrimary`, `onDanger`) has to darken to stay readable.
  primary: '#8bbcfb',
  primarySurface: '#172554',
  onPrimary: '#1c1917',
  danger: '#fa8d8d',
  dangerBorder: '#7f1d1d',
  dangerSurface: '#3f1212',
  onDanger: '#1c1917',
  success: '#4ade80',
  successBorder: '#166534',
  successSurface: '#0f2a1a',
  onSuccess: '#1c1917',
  warning: '#fbbf24',
  warningBorder: '#78350f',
  warningSurface: '#3a2a0a',
};

export function getColorsForScheme(scheme: ColorScheme): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

/**
 * Fixed hues that are not part of the light/dark ramp: chart series, the star
 * and ghosted markers, and the drop-shadow colour. Kept here so no screen
 * carries a hex literal. Brand marks in `OAuthProviderLogo` are the one
 * documented exception, because those colours belong to the providers.
 */
export const fixedColors = {
  shadow: '#000000',
  star: '#eab308',
  ghost: '#d97706',
  onFilterPill: '#1c1917',
  followUp: '#f59e0b',
  interview: '#a855f7',
  offered: '#f97316',
  accepted: '#22c55e',
  logoLight: '#1e40af',
  logoDark: '#8bbcfb',
} as const;
