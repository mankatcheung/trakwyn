import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('renders with progressbar role and aria attributes', () => {
    render(<ProgressBar value={3} max={10} />);
    const el = screen.getByRole('progressbar');
    expect(el).toHaveAttribute('aria-valuenow', '3');
    expect(el).toHaveAttribute('aria-valuemax', '10');
  });

  it('sizes the fill to value/max as a percentage', () => {
    render(<ProgressBar value={5} max={10} />);
    const fill = screen.getByRole('progressbar').firstChild as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('clamps the fill to 100% when value exceeds max', () => {
    render(<ProgressBar value={15} max={10} />);
    const fill = screen.getByRole('progressbar').firstChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('clamps the fill to 0% for a negative value', () => {
    render(<ProgressBar value={-5} max={10} />);
    const fill = screen.getByRole('progressbar').firstChild as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('fills in the accent by default and in stone when quiet (JEF-693)', () => {
    const { rerender } = render(<ProgressBar value={5} max={5} />);
    expect((screen.getByRole('progressbar').firstChild as HTMLElement).className).toContain(
      'bg-blue-800',
    );

    rerender(<ProgressBar value={5} max={5} tone="quiet" />);
    const fill = screen.getByRole('progressbar').firstChild as HTMLElement;
    expect(fill.className).toContain('bg-stone-400');
    expect(fill.className).not.toContain('bg-blue');
  });
});
