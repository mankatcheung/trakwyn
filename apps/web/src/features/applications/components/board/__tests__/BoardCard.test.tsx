import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { BoardCard } from '#/features/applications/components/board/BoardCard';
import type { BoardApplication } from '#/features/applications/graphql/boardQueries';
import { defaultApplicationDisplayFields } from '#/features/applications/lib/applicationDisplayFields';

const app: BoardApplication = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'applied',
  location: 'Remote',
  appliedAt: '2024-01-01T00:00:00.000Z',
  starred: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  tags: ['a', 'b', 'c'],
  likelyGhosted: true,
  boardPosition: 0,
};

const allOn = {
  ...defaultApplicationDisplayFields(),
  role: true,
  location: true,
  tags: true,
  ghosted: true,
};

describe('BoardCard', () => {
  it('shows the fields switched on, and collapses extra tags', () => {
    render(<BoardCard app={app} displayFields={allOn} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('shows no status chip and neutral tags (the column states the status)', () => {
    render(<BoardCard app={app} displayFields={{ ...allOn, status: true }} />);
    expect(screen.queryByText(/applied/i)).not.toBeInTheDocument();
    expect(screen.getByText('a').className).not.toContain('blue');
  });

  it('hides fields that are switched off', () => {
    render(
      <BoardCard
        app={app}
        displayFields={{ ...allOn, role: false, location: false, tags: false }}
      />,
    );
    expect(screen.queryByText('Engineer')).not.toBeInTheDocument();
    expect(screen.queryByText('Remote')).not.toBeInTheDocument();
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
  });

  it('does not navigate when it is the drag overlay', () => {
    render(<BoardCard app={app} isOverlay displayFields={allOn} />);
    const link = screen.getByRole('link');
    const notPrevented = link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(notPrevented).toBe(false);
  });
});
