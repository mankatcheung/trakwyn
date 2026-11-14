import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockToastSuccess } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('sonner', () => ({ toast: { success: mockToastSuccess } }));

import { DraftHistoryPanel } from '#/routes/_authenticated/applications/$applicationId/-components/DraftHistoryPanel';

const VERSIONS = [
  { id: 'v3', source: 'ai', characterCount: 1200, createdAt: '2026-11-13T12:00:00.000Z' },
  { id: 'v2', source: 'manual', characterCount: 1, createdAt: '2026-11-13T11:00:00.000Z' },
  { id: 'v1', source: 'autosave', characterCount: 900, createdAt: '2026-11-13T10:00:00.000Z' },
];

type Handlers = {
  versions?: unknown[] | (() => Promise<unknown>);
  save?: () => Promise<unknown>;
  restore?: () => Promise<unknown>;
};

function mockApi({ versions = VERSIONS, save, restore }: Handlers = {}) {
  mockGqlRequest.mockImplementation((query: string, vars?: { id?: string }) => {
    if (query.includes('query DocumentDraftVersions'))
      return typeof versions === 'function'
        ? versions()
        : Promise.resolve({ documentDraftVersions: versions });
    if (query.includes('query DocumentDraftVersion('))
      return Promise.resolve({
        documentDraftVersion: {
          id: vars?.id,
          source: 'ai',
          plainText: `Text of ${vars?.id}`,
          createdAt: '2026-11-13T12:00:00.000Z',
        },
      });
    if (query.includes('CreateDocumentDraftVersion'))
      return save ? save() : Promise.resolve({ createDocumentDraftVersion: { id: 'v4' } });
    if (query.includes('RestoreDocumentDraftVersion'))
      return restore
        ? restore()
        : Promise.resolve({
            restoreDocumentDraftVersion: {
              id: 'draft-1',
              contentJson: '{"type":"doc","content":[]}',
              plainText: 'Text of v1',
            },
          });
    return Promise.resolve({});
  });
}

function renderPanel(props: Partial<React.ComponentProps<typeof DraftHistoryPanel>> = {}) {
  const prepare = vi.fn().mockResolvedValue(true);
  const onRestored = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DraftHistoryPanel
        draftId="draft-1"
        prepare={prepare}
        onRestored={onRestored}
        refreshKey={0}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { prepare, onRestored };
}

const operations = () =>
  mockGqlRequest.mock.calls.map(([query]) => /(?:query|mutation) (\w+)/.exec(String(query))?.[1]);

describe('DraftHistoryPanel (JEF-584)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    mockApi();
  });

  it('lists the versions newest first with what each one is and how long it is', async () => {
    renderPanel();
    const items = await screen.findAllByRole('button', { name: /characters?/i });
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/before ai change/i);
    expect(items[0]).toHaveTextContent('1,200 characters');
    expect(items[1]).toHaveTextContent(/saved by you/i);
    expect(items[1]).toHaveTextContent('1 character');
    expect(items[2]).toHaveTextContent(/edited/i);
  });

  it('explains an empty history', async () => {
    mockApi({ versions: [] });
    renderPanel();
    expect(await screen.findByText(/no saved versions yet/i)).toBeInTheDocument();
  });

  it('says so when the history cannot be loaded', async () => {
    mockApi({ versions: () => Promise.reject(new Error('boom')) });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
  });

  it('shows a read-only preview of the chosen version', async () => {
    renderPanel();
    fireEvent.click((await screen.findAllByRole('button', { name: /characters?/i }))[2]!);
    expect(await screen.findByText('Text of v1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore this version/i })).toBeInTheDocument();
  });

  describe('Save version', () => {
    it('settles pending edits first, then saves and refreshes the list', async () => {
      const { prepare } = renderPanel();
      await screen.findAllByRole('button', { name: /characters?/i });
      fireEvent.click(screen.getByRole('button', { name: /save version/i }));
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      expect(prepare).toHaveBeenCalled();
      const ops = operations();
      expect(ops.indexOf('CreateDocumentDraftVersion')).toBeGreaterThan(-1);
      // The list is read again afterwards.
      expect(ops.filter((op) => op === 'DocumentDraftVersions').length).toBeGreaterThanOrEqual(2);
    });

    it('does not save while the editor’s own save has failed, and says why', async () => {
      const { prepare } = renderPanel();
      prepare.mockResolvedValue(false);
      await screen.findAllByRole('button', { name: /characters?/i });
      fireEvent.click(screen.getByRole('button', { name: /save version/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
      expect(operations()).not.toContain('CreateDocumentDraftVersion');
    });

    it('shows the API’s message when saving is refused', async () => {
      mockApi({
        save: () =>
          Promise.reject({
            response: {
              errors: [
                { message: 'There is nothing to save yet', extensions: { code: 'VALIDATION' } },
              ],
            },
          }),
      });
      renderPanel();
      await screen.findAllByRole('button', { name: /characters?/i });
      fireEvent.click(screen.getByRole('button', { name: /save version/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent('There is nothing to save yet');
    });
  });

  describe('Restore', () => {
    const choose = async () => {
      fireEvent.click((await screen.findAllByRole('button', { name: /characters?/i }))[2]!);
      await screen.findByText('Text of v1');
    };

    it('asks first, then restores and hands the restored draft to the page', async () => {
      const { prepare, onRestored } = renderPanel();
      await choose();
      fireEvent.click(screen.getByRole('button', { name: /restore this version/i }));
      await waitFor(() => expect(onRestored).toHaveBeenCalled());
      expect(confirm).toHaveBeenCalled();
      expect(prepare).toHaveBeenCalled();
      expect(onRestored).toHaveBeenCalledWith({
        id: 'draft-1',
        contentJson: '{"type":"doc","content":[]}',
        plainText: 'Text of v1',
      });
    });

    it('does nothing when the user cancels the question', async () => {
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
      const { onRestored } = renderPanel();
      await choose();
      fireEvent.click(screen.getByRole('button', { name: /restore this version/i }));
      expect(onRestored).not.toHaveBeenCalled();
      expect(operations()).not.toContain('RestoreDocumentDraftVersion');
    });

    it('does not restore over an edit that failed to save', async () => {
      const { prepare, onRestored } = renderPanel();
      prepare.mockResolvedValue(false);
      await choose();
      fireEvent.click(screen.getByRole('button', { name: /restore this version/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
      expect(onRestored).not.toHaveBeenCalled();
    });

    it('reports a failed restore and leaves the page alone', async () => {
      mockApi({ restore: () => Promise.reject(new Error('nope')) });
      const { onRestored } = renderPanel();
      await choose();
      fireEvent.click(screen.getByRole('button', { name: /restore this version/i }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(onRestored).not.toHaveBeenCalled();
    });
  });

  it('re-reads the history when the draft has been saved again', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = {
      draftId: 'draft-1',
      prepare: vi.fn().mockResolvedValue(true),
      onRestored: vi.fn(),
    };
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <DraftHistoryPanel {...props} refreshKey={1} />
      </QueryClientProvider>,
    );
    await screen.findAllByRole('button', { name: /characters?/i });
    const before = operations().filter((op) => op === 'DocumentDraftVersions').length;
    rerender(
      <QueryClientProvider client={client}>
        <DraftHistoryPanel {...props} refreshKey={2} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(operations().filter((op) => op === 'DocumentDraftVersions').length).toBeGreaterThan(
        before,
      ),
    );
    expect(within(document.body).getAllByRole('button', { name: /characters?/i })).toHaveLength(3);
  });
});
