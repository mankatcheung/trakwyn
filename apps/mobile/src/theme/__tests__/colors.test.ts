import { darkColors, getColorsForScheme, lightColors, type ThemeColors } from '../colors';

/** WCAG 2.1 relative luminance of an `#rrggbb` colour. */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two `#rrggbb` colours, 1:1 to 21:1. */
function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for body text. Everything these tokens carry is body-sized or smaller. */
const AA = 4.5;

/**
 * Every foreground token, against every background it is actually rendered on
 * (JEF-302). Backgrounds a token is never paired with are left out rather than
 * asserted loosely — an unused pairing failing tells us nothing.
 */
const TEXT_ON_BACKGROUND: readonly [keyof ThemeColors, readonly (keyof ThemeColors)[]][] = [
  ['text', ['background', 'surface', 'surfaceAlt', 'primarySurface', 'successSurface']],
  ['textMuted', ['background', 'surface', 'surfaceAlt', 'successSurface', 'warningSurface']],
  ['textSubtle', ['background', 'surface', 'surfaceAlt']],
  ['textFaint', ['background', 'surface', 'surfaceAlt']],
  ['primary', ['background', 'surface', 'surfaceAlt', 'primarySurface']],
  ['danger', ['background', 'surface', 'surfaceAlt', 'dangerSurface']],
  ['success', ['background', 'surface', 'surfaceAlt', 'successSurface']],
  ['warning', ['background', 'surface', 'surfaceAlt', 'warningSurface']],
  // Labels sitting on a filled accent.
  ['onPrimary', ['primary']],
  ['onDanger', ['danger']],
  // The inverted pill (ApplicationFormScreen's active status chip).
  ['background', ['text']],
  ['onSuccess', ['success']],
];

/** Tokens that must stay visually ordered from strongest to weakest. */
const TEXT_RAMP: readonly (keyof ThemeColors)[] = ['text', 'textMuted', 'textSubtle', 'textFaint'];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s theme', (_scheme, colors) => {
  describe.each(TEXT_ON_BACKGROUND)('%s', (foreground, backgrounds) => {
    it.each(backgrounds)(`meets WCAG AA on %s`, (background) => {
      const ratio = contrastRatio(colors[foreground], colors[background]);
      // Rounded into the assertion so a failure reports the ratio it got.
      expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(AA);
    });
  });

  it('keeps the text ramp strictly ordered by contrast against the surface', () => {
    const ratios = TEXT_RAMP.map((token) => contrastRatio(colors[token], colors.surface));
    const descending = [...ratios].sort((a, b) => b - a);
    expect(ratios).toEqual(descending);
    // Adjacent steps must be far enough apart to read as a hierarchy.
    ratios.slice(1).forEach((ratio, index) => {
      expect(ratios[index] / ratio).toBeGreaterThan(1.1);
    });
  });

  it('defines every token as a six-digit hex value', () => {
    Object.entries(colors).forEach(([token, value]) => {
      expect(`${token}=${value}`).toMatch(/=#[0-9a-f]{6}$/);
    });
  });
});

describe('getColorsForScheme', () => {
  it('returns the matching palette', () => {
    expect(getColorsForScheme('light')).toBe(lightColors);
    expect(getColorsForScheme('dark')).toBe(darkColors);
  });

  it('defines the same tokens in both palettes', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });
});
