import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RefObject } from 'react';

const { mockGqlRequest, mockNavigate, mockDownloadUrl, mockToastSuccess } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
  mockDownloadUrl: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useParams: () => ({ applicationId: 'app-1', draftId: 'draft-1' }),
  }),
  useNavigate: () => mockNavigate,
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('#/lib/downloadUrl', () => ({ downloadUrl: mockDownloadUrl }));
vi.mock('#/routes/_authenticated/applications/$applicationId/-components/AiHelperPanel', () => ({
  AiHelperPanel: ({
    onSave,
    plainText,
    initialInstructions,
  }: {
    onSave: (json: string, text: string, instructions: string) => Promise<boolean>;
    plainText: string;
    initialInstructions: string | null;
  }) => (
    <button onClick={() => void onSave('{"ai":true}', 'ai text', 'make it short')}>
      mock ai save [{plainText}] [{initialInstructions}]
    </button>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: mockToastSuccess } }));

// Stands in for the TipTap editor with an edit still waiting out its save
// debounce: flushing it is what hands that edit to the page's `onUpdate`.
vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor',
  () => ({
    DocumentDraftEditor: ({
      onUpdate,
      flushRef,
      editorRef,
    }: {
      onUpdate: (json: string, text: string) => void;
      flushRef?: RefObject<(() => void) | null>;
      editorRef?: RefObject<{
        getJson: () => string;
        getText: () => string;
      } | null>;
    }) => {
      if (flushRef) flushRef.current = () => onUpdate('{"edited":true}', 'edited');
      if (editorRef)
        editorRef.current = { getJson: () => '{"on":"screen"}', getText: () => 'on screen' };
      return <div data-testid="editor" />;
    },
  }),
);

import { DocumentDraftEditPage } from '#/routes/_authenticated/applications/$applicationId/documents/$draftId';

const DRAFT = {
  id: 'draft-1',
  applicationId: 'app-1',
  type: 'resume',
  title: 'My Resume',
  contentJson: '{}',
  plainText: '',
  sourceDocumentId: null,
  aiInstructions: 'last prompt',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};
const PDF = { id: 'doc-9', name: 'My_Resume.pdf', url: 'https://blob.example/doc-9.pdf' };

type Handlers = { save?: () => Promise<unknown>; exportPdf?: () => Promise<unknown> };

function mockApi({ save, exportPdf }: Handlers = {}) {
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('query DocumentDraft')) return Promise.resolve({ documentDraft: DRAFT });
    if (query.includes('UpdateDocumentDraftContent'))
      return save ? save() : Promise.resolve({ updateDocumentDraftContent: { id: 'draft-1' } });
    if (query.includes('ExportDocumentDraftToPdf'))
      return exportPdf ? exportPdf() : Promise.resolve({ exportDocumentDraftToPdf: PDF });
    return Promise.resolve({});
  });
}

const operations = () =>
  mockGqlRequest.mock.calls.map(([query]) => /(?:query|mutation) (\w+)/.exec(String(query))?.[1]);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <DocumentDraftEditPage />
    </QueryClientProvider>,
  );
  return { invalidate };
}

const clickExport = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /export pdf/i }));

describe('DocumentDraftEditPage — Export PDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('downloads the exported PDF, confirms it, and stays in the editor', async () => {
    renderPage();
    await clickExport();

    await waitFor(() => expect(mockDownloadUrl).toHaveBeenCalledWith(PDF.url, PDF.name));
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'PDF saved to Documents',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Open PDF' }) }),
    );
    // Leaving the page was what made the export look like it did nothing.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("refetches the application's resume matches after a save, so a stale one shows its reminder (JEF-397)", async () => {
    const { invalidate } = renderPage();
    await clickExport();

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['resumeMatches', 'app-1'] }),
    );
  });

  it("refetches the application's ATS results after a save, so a stale one shows its reminder (JEF-395)", async () => {
    const { invalidate } = renderPage();
    await clickExport();

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['resumeAtsScores', 'app-1'] }),
    );
  });

  it('refreshes the application documents list so the new PDF appears', async () => {
    const { invalidate } = renderPage();
    await clickExport();

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documents', 'app-1'] }),
    );
  });

  it('saves the pending edit before exporting', async () => {
    renderPage();
    await clickExport();

    await waitFor(() => expect(mockDownloadUrl).toHaveBeenCalled());
    expect(operations()).toEqual([
      'DocumentDraft',
      'UpdateDocumentDraftContent',
      'ExportDocumentDraftToPdf',
    ]);
  });

  it('waits for an in-flight save to finish before exporting', async () => {
    let finishSave: (value: unknown) => void = () => {};
    mockApi({ save: () => new Promise((resolve) => (finishSave = resolve)) });
    renderPage();
    await clickExport();

    await waitFor(() => expect(operations()).toContain('UpdateDocumentDraftContent'));
    expect(operations()).not.toContain('ExportDocumentDraftToPdf');

    finishSave({ updateDocumentDraftContent: { id: 'draft-1' } });
    await waitFor(() => expect(operations()).toContain('ExportDocumentDraftToPdf'));
  });

  it('does not export stale content when the save fails', async () => {
    mockApi({ save: () => Promise.reject(new Error('network down')) });
    renderPage();
    await clickExport();

    expect(await screen.findByText(/couldn't save your latest changes/i)).toBeInTheDocument();
    expect(operations()).not.toContain('ExportDocumentDraftToPdf');
    expect(mockDownloadUrl).not.toHaveBeenCalled();
  });

  it('shows an error when the export fails', async () => {
    mockApi({
      exportPdf: () =>
        Promise.reject({
          response: { errors: [{ message: 'Draft not found', extensions: { code: 'NOT_FOUND' } }] },
        }),
    });
    renderPage();
    await clickExport();

    expect(await screen.findByText(/couldn't be found/i)).toBeInTheDocument();
    expect(mockDownloadUrl).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /export pdf/i })).toBeEnabled();
  });
});

describe('DocumentDraftEditPage — AI helper (JEF-506)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('hands the helper the saved text and the last prompt', async () => {
    renderPage();
    expect(await screen.findByText(/mock ai save \[\] \[last prompt\]/)).toBeInTheDocument();
  });

  it("saves the helper's content together with its prompt, and treats it as saved", async () => {
    renderPage();
    fireEvent.click(await screen.findByText(/mock ai save/));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('UpdateDocumentDraftContent'),
        {
          input: {
            draftId: 'draft-1',
            contentJson: '{"ai":true}',
            plainText: 'ai text',
            aiInstructions: 'make it short',
          },
        },
      ),
    );
    expect(
      await screen.findByText(/mock ai save \[ai text\] \[make it short\]/),
    ).toBeInTheDocument();
  });

  it('keeps an AI save that failed visible, and retries it with what is on screen', async () => {
    let failNext = true;
    mockApi({
      save: () => (failNext ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true })),
    });
    renderPage();
    fireEvent.click(await screen.findByText(/mock ai save/));

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
    // The text counts as the draft's even though the save failed.
    expect(screen.getByText(/mock ai save \[ai text\]/)).toBeInTheDocument();

    failNext = false;
    fireEvent.click(screen.getByRole('button', { name: /retry save/i }));

    await waitFor(() => expect(screen.queryByText(/could not be saved/i)).not.toBeInTheDocument());
    expect(mockGqlRequest).toHaveBeenLastCalledWith(
      expect.stringContaining('UpdateDocumentDraftContent'),
      {
        input: {
          draftId: 'draft-1',
          contentJson: '{"on":"screen"}',
          plainText: 'on screen',
          aiInstructions: 'make it short',
        },
      },
    );
  });

  it('runs saves one at a time, in order, so an older one cannot land after a newer one', async () => {
    const finishers: Array<(v: unknown) => void> = [];
    mockApi({ save: () => new Promise((resolve) => finishers.push(resolve)) });
    renderPage();
    const button = await screen.findByText(/mock ai save/);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(finishers).toHaveLength(1));
    // The second save has not been sent while the first is in flight.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(finishers).toHaveLength(1);

    finishers[0]!({ ok: true });
    await waitFor(() => expect(finishers).toHaveLength(2));
  });

  it('does not send aiInstructions for an ordinary editor save', async () => {
    renderPage();
    await clickExport();

    await waitFor(() => expect(mockDownloadUrl).toHaveBeenCalled());
    const save = mockGqlRequest.mock.calls.find(([q]) =>
      String(q).includes('UpdateDocumentDraftContent'),
    );
    expect(save![1].input).not.toHaveProperty('aiInstructions');
  });
});
