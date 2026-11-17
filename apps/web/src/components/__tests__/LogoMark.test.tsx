import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LogoMark } from '#/components/LogoMark';

describe('LogoMark', () => {
  it('renders an SVG element', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('uses default size of 24', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('accepts a custom size prop', () => {
    const { container } = render(<LogoMark size={48} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('applies a custom className', () => {
    // Fixture string, not a real utility — the point is pass-through.
    // eslint-disable-next-line better-tailwindcss/no-unknown-classes
    const { container } = render(<LogoMark className="my-class" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('my-class');
  });

  it('has aria-hidden for decorative use', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws two chevrons that inherit their colour', () => {
    const { container } = render(<LogoMark />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2);
    for (const path of paths) {
      expect(path).toHaveAttribute('stroke', 'currentColor');
    }
  });

  it('carries the brand blue in light mode and lifts it in dark mode', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');

    // blue-700 on gray-900 sits too close to its own background to read, so
    // dark mode moves to blue-400. Dropping the dark: variant would leave the
    // mark technically visible and practically invisible.
    expect(svg).toHaveClass('text-blue-700');
    expect(svg).toHaveClass('dark:text-blue-400');
  });

  it('keeps its colour when a caller passes a className', () => {
    const { container } = render(<LogoMark className="shrink-0" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveClass('shrink-0');
    expect(svg).toHaveClass('text-blue-700');
  });

  it('gives the trailing chevron a lighter stroke than the leading one', () => {
    const { container } = render(<LogoMark />);
    const [trailing, leading] = container.querySelectorAll('path');

    // The whole point of the mark. Two chevrons at equal weight read as a
    // media control; unequal ones read as a position and the one before it.
    // Equalising these would quietly turn the logo into a fast-forward icon.
    expect(Number(trailing.getAttribute('stroke-width'))).toBeLessThan(
      Number(leading.getAttribute('stroke-width')),
    );
  });

  it('is the only place the mark is drawn', () => {
    // The landing page shipped its own inline copy of the SVG and quietly kept
    // the old mark through a rebrand, because nothing pointed at it. Anything
    // that wants the mark imports this component.
    const src = join(process.cwd(), 'src');
    const allowed = new Set(['components/LogoMark.tsx', '__tests__/components/LogoMark.test.tsx']);
    // Path data from the current mark and from the one it replaced.
    const markSignatures = [/M24\.5 13/, /M11\.5 13/, /M32\.3,16/];

    const offenders: string[] = [];
    let scanned = 0;
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx?|css)$/.test(entry)) continue;
        const rel = relative(src, full);
        if (allowed.has(rel)) continue;
        scanned += 1;
        const contents = readFileSync(full, 'utf8');
        if (markSignatures.some((signature) => signature.test(contents))) offenders.push(rel);
      }
    };
    walk(src);

    // Guard the guard: a wrong cwd would walk nothing and pass silently.
    expect(scanned).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
