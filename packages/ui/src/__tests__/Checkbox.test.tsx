import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Checkbox } from '../Checkbox';

describe('Checkbox', () => {
  it('renders a checkbox input', () => {
    const { container } = render(<Checkbox />);
    const el = container.firstChild as HTMLInputElement;
    expect(el.type).toBe('checkbox');
  });

  it('defaults to md size and blue tone', () => {
    const { container } = render(<Checkbox />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-4');
    expect(el.className).toContain('text-blue-800');
  });

  it('applies the sm size', () => {
    const { container } = render(<Checkbox size="sm" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-3.5');
  });

  it('applies the yellow tone', () => {
    const { container } = render(<Checkbox tone="yellow" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('text-yellow-400');
  });

  it('merges additional className', () => {
    const { container } = render(<Checkbox className="shrink-0" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('shrink-0');
  });
});
