import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockDelete } = vi.hoisted(() => ({ mockDelete: vi.fn() }));

vi.mock('#/features/applications/lib/deleteWithUndo', () => ({
  deleteApplicationsWithUndo: mockDelete,
}));

import { BulkActionBar } from '#/features/applications/components/BulkActionBar';
import type { Application } from '#/features/applications/graphql/applicationsPageQueries';

function makeBulk(overrides: Record<string, unknown> = {}) {
  return {
    isPending: false,
    bulkUpdateStatus: vi.fn(),
    bulkAddTag: vi.fn(),
    bulkSetStarred: vi.fn(),
    ...overrides,
  } as never;
}

function renderBar(bulk = makeBulk(), onClear = vi.fn()) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <BulkActionBar
        selectedIds={new Set(['a', 'b'])}
        apps={[] as Application[]}
        onClear={onClear}
        bulk={bulk}
        status={undefined}
        starred={undefined}
        likelyGhosted={undefined}
        searchTerm=""
      />
    </QueryClientProvider>,
  );
  return { bulk, onClear };
}

describe('BulkActionBar', () => {
  it('stars and unstars the selection', () => {
    const bulk = makeBulk();
    renderBar(bulk);
    fireEvent.click(screen.getByRole('button', { name: /unstar/i }));
    fireEvent.click(screen.getByRole('button', { name: /^star/i }));
    const setStarred = (bulk as { bulkSetStarred: ReturnType<typeof vi.fn> }).bulkSetStarred;
    expect(setStarred).toHaveBeenNthCalledWith(1, ['a', 'b'], false);
    expect(setStarred).toHaveBeenNthCalledWith(2, ['a', 'b'], true);
  });

  it('adds a trimmed tag on Enter and clears the field', () => {
    const { bulk } = renderBar();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  remote  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((bulk as { bulkAddTag: ReturnType<typeof vi.fn> }).bulkAddTag).toHaveBeenCalledWith(
      ['a', 'b'],
      'remote',
      [],
    );
    expect(input).toHaveValue('');
  });

  it('deletes through the undo helper and clears the selection', () => {
    const { onClear } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onClear).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(
      expect.anything(),
      ['a', 'b'],
      expect.any(String),
      expect.any(Function),
    );
  });

  it('disables actions while a bulk change is pending', () => {
    renderBar(makeBulk({ isPending: true }));
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });
});
