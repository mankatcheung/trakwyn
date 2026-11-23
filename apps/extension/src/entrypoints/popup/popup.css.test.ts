import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The popup's palette follows the web's warm stone and ink-blue look (JEF-673).
const css = readFileSync(resolve(__dirname, 'popup.css'), 'utf8');

const MIN_CONTRAST = 4.5;

function tokensIn(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const lightBlock = css.slice(css.indexOf(':root'), darkStart);
const darkBlock = css.slice(darkStart, css.indexOf('}\n}', darkStart));
const light = tokensIn(lightBlock);
const dark = { ...light, ...tokensIn(darkBlock) };

function luminance(hex: string): number {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [text token, surface token]
const PAIRS: Array<[string, string]> = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text-2', 'bg'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['accent-text', 'bg'],
  ['accent-text', 'accent-tint'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['error', 'error-bg'],
];

describe('popup.css', () => {
  it('uses the web palette', () => {
    expect(light).toMatchObject({
      bg: '#fafaf9',
      border: '#e7e5e4',
      'border-strong': '#d6d3d1',
      text: '#1c1917',
      'text-2': '#44403c',
      muted: '#78716c',
      accent: '#1e40af',
      'accent-tint': '#eff6ff',
    });
  });

  it('keeps the old cool gray and blue out of the stylesheet', () => {
    expect(css).not.toMatch(
      /#(f9fafb|e5e7eb|d1d5db|111827|374151|6b7280|9ca3af|2563eb|1d4ed8|3b82f6)\b/i,
    );
  });

  it('declares colours once, as tokens', () => {
    const outsideTokens = css
      .replace(/:root\s*{[^}]*}/g, '')
      .replace(/@media[^{]*{\s*:root\s*{[^}]*}\s*}/g, '');
    expect(outsideTokens).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it('uses weights of 400 and 500 only', () => {
    const weights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(weights.length).toBeGreaterThan(0);
    expect(weights.every((w) => w === 400 || w === 500)).toBe(true);
  });

  it('has no text under 12px', () => {
    const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it('follows the system colour scheme', () => {
    expect(css).toContain('color-scheme: light dark');
    expect(darkBlock).toContain('--bg:');
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ])('reaches 4.5:1 on its surfaces in %s', (_name, tokens) => {
    for (const [fg, bg] of PAIRS) {
      expect(contrast(tokens[fg], tokens[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    }
  });
});
