import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LockedAnalyticsSample } from '../LockedAnalyticsSample';

describe('LockedAnalyticsSample', () => {
  it('draws the five made-up stats', () => {
    render(<LockedAnalyticsSample />);
    for (const value of ['48', '21', '58%', '12%', '19%']) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it('draws the same page again on a re-render', () => {
    const { container, rerender } = render(<LockedAnalyticsSample />);
    const before = container.innerHTML;
    rerender(<LockedAnalyticsSample />);
    expect(container.innerHTML).toBe(before);
  });

  it('draws the chart and funnel sections with their headings', () => {
    render(<LockedAnalyticsSample />);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
  });

  it('draws one bar per sample value, scaled to it', () => {
    const { container } = render(<LockedAnalyticsSample />);
    const heights = [...container.querySelectorAll<HTMLElement>('.rounded-t')].map(
      (el) => el.style.height,
    );
    expect(heights).toEqual(['38%', '62%', '45%', '80%', '58%', '92%', '70%', '54%']);
  });

  it('fades each placeholder row a little more than the one before', () => {
    const { container } = render(<LockedAnalyticsSample />);
    const rows = [...container.querySelectorAll<HTMLElement>('.bg-green-500\\/60')].slice(0, 4);
    expect(rows.map((r) => Number(r.style.opacity))).toEqual([1, 0.88, 0.76, 0.64]);
  });
});
