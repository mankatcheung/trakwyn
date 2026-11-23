import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '#/features/applications/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders the localized status text', () => {
    render(<StatusBadge status="interviewing" />);
    expect(screen.getByText('Interviewing')).toBeInTheDocument();
  });

  it('applies a known status color', () => {
    render(<StatusBadge status="offered" />);
    expect(screen.getByText('Offered')).toHaveClass('bg-orange-100');
  });

  it('uses the shared palette, so a badge matches the board', () => {
    // These three used to disagree with the board: interviewing was yellow
    // here and purple there, offered green vs orange, accepted emerald vs
    // green. Both sides now read STATUS_COLORS.
    const cases = [
      ['interviewing', 'Interviewing', 'bg-purple-100'],
      ['offered', 'Offered', 'bg-orange-100'],
      ['accepted', 'Accepted', 'bg-green-100'],
      ['withdrawn', 'Withdrawn', 'bg-slate-100'],
    ] as const;

    for (const [status, label, expected] of cases) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(label)).toHaveClass(expected);
      unmount();
    }
  });

  it('falls back to the draft style for an unrecognized status', () => {
    render(<StatusBadge status="unknown_status" />);
    expect(screen.getByText('unknown_status')).toHaveClass('bg-stone-100', 'text-stone-700');
  });
});
