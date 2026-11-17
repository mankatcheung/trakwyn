import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { BoardColumn } from '#/features/applications/components/board/BoardColumn';
import type { BoardApplication } from '#/features/applications/graphql/boardQueries';
import { defaultApplicationDisplayFields } from '#/features/applications/lib/applicationDisplayFields';

const make = (id: string, company: string): BoardApplication => ({
  id,
  company,
  role: 'Engineer',
  status: 'applied',
  location: null,
  appliedAt: null,
  starred: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  tags: [],
  likelyGhosted: false,
  boardPosition: 0,
});

function renderColumn(ids: string[], apps: BoardApplication[]) {
  return render(
    <DndContext>
      <BoardColumn
        status="applied"
        ids={ids}
        appsById={new Map(apps.map((a) => [a.id, a]))}
        displayFields={defaultApplicationDisplayFields()}
      />
    </DndContext>,
  );
}

describe('BoardColumn', () => {
  it('renders its cards in the given order with a count', () => {
    renderColumn(['b', 'a'], [make('a', 'Acme'), make('b', 'Beta')]);
    expect(screen.getByTestId('board-column-applied')).toHaveTextContent('2');
    const names = screen.getAllByText(/^(Acme|Beta)$/).map((el) => el.textContent);
    expect(names).toEqual(['Beta', 'Acme']);
  });

  it('stays a drop target when empty', () => {
    renderColumn([], []);
    expect(screen.getByTestId('board-column-applied')).toHaveTextContent('0');
    expect(screen.getByTestId('column-dot-applied')).toBeInTheDocument();
  });

  it('skips an id whose application is missing', () => {
    renderColumn(['gone', 'a'], [make('a', 'Acme')]);
    expect(screen.getAllByText('Acme')).toHaveLength(1);
  });
});
