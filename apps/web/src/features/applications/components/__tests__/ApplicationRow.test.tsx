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

  it('renders tags as neutral chips, so the status is the one coloured element', () => {
    render(<ApplicationRow app={app} displayFields={fields} selected={false} onToggle={vi.fn()} />);
    const chip = screen.getByText('a');
    expect(chip.className).toContain('bg-stone-100');
    expect(chip.className).not.toContain('blue');
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

  it('shows the applied date as "Jun 15, 2020", not the numeric browser format (JEF-693)', () => {
    const applied = new Date(2020, 5, 15, 12).toISOString();
    render(
      <ApplicationRow
        app={{ ...app, appliedAt: applied }}
        displayFields={{ ...fields, date: true }}
        selected={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Jun 15, 2020')).toBeInTheDocument();
    expect(screen.queryByText(/\d\/\d/)).not.toBeInTheDocument();
  });
});
