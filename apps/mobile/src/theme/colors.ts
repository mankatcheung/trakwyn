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
  onPrimary: string;
  danger: string;
  dangerBorder: string;
  dangerSurface: string;
}

// The light palette is the app's original hardcoded values, kept as-is so
// migrating a screen to theme tokens is a no-op in light mode.
export const lightColors: ThemeColors = {
  background: '#f9fafb',
  surface: '#ffffff',
  surfaceAlt: '#f3f4f6',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
  text: '#111827',
  textMuted: '#374151',
  textSubtle: '#6b7280',
  textFaint: '#9ca3af',
  primary: '#2563eb',
  primarySurface: '#eff6ff',
  onPrimary: '#ffffff',
  danger: '#b91c1c',
  dangerBorder: '#fecaca',
  dangerSurface: '#fef2f2',
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
  textFaint: '#6b7280',
  primary: '#3b82f6',
  primarySurface: '#1e3a8a',
  onPrimary: '#ffffff',
  danger: '#f87171',
  dangerBorder: '#7f1d1d',
  dangerSurface: '#3f1212',
};

export function getColorsForScheme(scheme: ColorScheme): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}
