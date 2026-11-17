import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { NotesTab } from '#/routes/_authenticated/applications/$applicationId/-components/NotesTab';

const NOTE = {
  id: 'note-1',
  applicationId: 'app-1',
  content: 'Original note',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotesTab applicationId="app-1" enabled />
    </QueryClientProvider>,
  );
}

async function startEditing() {
  const user = userEvent.setup();
  renderTab();
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  return user;
}

describe('NotesTab edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables Save and Cancel and shows the saving label while the update is in flight', async () => {
    let resolveUpdate: (v: unknown) => void = () => {};
    mockGqlRequest.mockImplementation((doc: string) => {
      if (doc.includes('mutation UpdateNote')) {
        return new Promise((resolve) => {
          resolveUpdate = resolve;
        });
      }
      return Promise.resolve({ notes: [NOTE] });
    });
    const user = await startEditing();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await user.click(saving);
    const updateCalls = mockGqlRequest.mock.calls.filter(([doc]) =>
      String(doc).includes('mutation UpdateNote'),
    );
    expect(updateCalls).toHaveLength(1);

    resolveUpdate({ updateNote: { ...NOTE, content: 'Original note' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
  });

  it('disables Save when the edited content is empty', async () => {
    mockGqlRequest.mockResolvedValue({ notes: [NOTE] });
    const user = await startEditing();

    const textarea = screen.getByDisplayValue('Original note');
    await user.clear(textarea);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.type(textarea, '   ');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps the editor open with the typed content when the update fails', async () => {
    mockGqlRequest.mockImplementation((doc: string) =>
      doc.includes('mutation UpdateNote')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ notes: [NOTE] }),
    );
    const user = await startEditing();

    const textarea = screen.getByDisplayValue('Original note');
    await user.clear(textarea);
    await user.type(textarea, 'Edited');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByDisplayValue('Edited')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});
