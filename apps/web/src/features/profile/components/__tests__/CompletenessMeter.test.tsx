import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    hash,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    hash?: string;
    [key: string]: unknown;
  }) => (
    <a href={`${to}#${hash ?? ''}`} {...rest}>
      {children}
    </a>
  ),
}));

import { CompletenessMeter, CHECK_SECTION } from '../CompletenessMeter';
import type { ProfileCheck, ProfileCompleteness } from '../../lib/profileCompleteness';

function meter(percent: number, nextStep: ProfileCheck | null) {
  return render(
    <CompletenessMeter completeness={{ percent, nextStep } as unknown as ProfileCompleteness} />,
  );
}

describe('CompletenessMeter', () => {
  it('shows the percentage as text and as the progress bar label', () => {
    meter(50, 'skills');
    expect(screen.getAllByText(/50/).length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('50'),
    );
  });

  it('fills in the accent while incomplete and turns green at 100% (JEF-695)', () => {
    const { unmount } = meter(60, 'skills');
    expect((screen.getByRole('progressbar').firstChild as HTMLElement).className).toContain(
      'bg-blue-800',
    );
    unmount();

    meter(100, null);
    const fill = screen.getByRole('progressbar').firstChild as HTMLElement;
    expect(fill.className).toContain('bg-green-600');
    expect(fill.className).not.toContain('bg-blue');
  });

  it.each<ProfileCheck>(['role', 'roleDescription', 'education', 'skills'])(
    'links the %s step to the section that completes it',
    (step) => {
      meter(25, step);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', `/profile#${CHECK_SECTION[step]}`);
    },
  );

  it('sends role and roleDescription to the same section', () => {
    expect(CHECK_SECTION.role).toBe(CHECK_SECTION.roleDescription);
    expect(new Set(Object.values(CHECK_SECTION)).size).toBe(3);
  });

  it('says "complete" once, with no link, when nothing is missing (JEF-695)', () => {
    meter(100, null);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getAllByText(/complete/i)).toHaveLength(1);
    expect(screen.getByText('Profile 100% complete')).toBeInTheDocument();
  });

  it('keeps the same output for the same props and follows changed ones', () => {
    const props = (percent: number, nextStep: ProfileCheck | null) => ({
      completeness: { percent, nextStep } as unknown as ProfileCompleteness,
    });
    const { container, rerender } = render(<CompletenessMeter {...props(40, 'role')} />);
    const before = container.innerHTML;
    rerender(<CompletenessMeter {...props(40, 'role')} />);
    expect(container.innerHTML).toBe(before);
    rerender(<CompletenessMeter {...props(75, 'education')} />);
    expect(container.innerHTML).not.toBe(before);
    expect(screen.getByRole('link')).toHaveAttribute('href', `/profile#${CHECK_SECTION.education}`);
    rerender(<CompletenessMeter {...props(100, null)} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
