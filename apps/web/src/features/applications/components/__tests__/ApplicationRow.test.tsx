import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { ApplicationRow } from '#/features/applications/components/ApplicationRow';
import type { Application } from '#/features/applications/graphql/applicationsPageQueries';
import { defaultApplicationDisplayFields } from '#/features/applications/lib/applicationDisplayFields';

const app = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'applied',
  location: 'Remote',
  appliedAt: null,
  starred: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  tags: ['a', 'b', 'c', 'd'],
  likelyGhosted: false,
} as unknown as Application;

const fields = { ...defaultApplicationDisplayFields(), role: true, location: true, tags: true };

describe('ApplicationRow', () => {
  it('shows company, role and location, and collapses tags past three', () => {
    render(<ApplicationRow app={app} displayFields={fields} selected={false} onToggle={vi.fn()} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Engineer · Remote')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('reports its id when the checkbox is toggled', () => {
    const onToggle = vi.fn();
    render(
      <ApplicationRow app={app} displayFields={fields} selected={false} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('app-1');
  });

  it('reflects the selected state', () => {
    render(<ApplicationRow app={app} displayFields={fields} selected onToggle={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
