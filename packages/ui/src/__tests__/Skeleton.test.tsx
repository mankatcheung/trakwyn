import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '../Skeleton';

describe('Skeleton', () => {
  it('renders a pulsing placeholder block', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('bg-stone-100');
  });

  it('merges additional className for sizing and rounding', () => {
    const { container } = render(<Skeleton className="h-48 rounded-xl" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-48');
    expect(el.className).toContain('rounded-xl');
    expect(el.className).toContain('animate-pulse');
  });
});
