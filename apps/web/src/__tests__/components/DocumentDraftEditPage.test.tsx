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
vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/ImportDocumentAction',
  () => ({
    ImportDocumentAction: ({
      onSave,
    }: {
      onSave: (json: string, text: string) => Promise<boolean>;
    }) => <button onClick={() => void onSave('{"imported":true}', 'imported')}>mock import</button>,
  }),
);
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

type Handlers = {
  save?: () => Promise<unknown>;
  exportPdf?: () => Promise<unknown>;
  rename?: () => Promise<unknown>;
};

function mockApi({ save, exportPdf, rename }: Handlers = {}) {
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('query DocumentDraft')) return Promise.resolve({ documentDraft: DRAFT });
    if (query.includes('UpdateDocumentDraftContent'))
      return save ? save() : Promise.resolve({ updateDocumentDraftContent: { id: 'draft-1' } });
    if (query.includes('RenameDocumentDraft'))
      return rename ? rename() : Promise.resolve({ renameDocumentDraft: { id: 'draft-1' } });
    if (query.includes('ExportDocumentDraftToPdf'))
      return exportPdf ? exportPdf() : Promise.resolve({ exportDocumentDraftToPdf: PDF });
    return Promise.resolve({});
  });
}

// The import action reads the application's documents; that is not what these tests are about.
const operations = () =>
  mockGqlRequest.mock.calls
    .map(([query]) => /(?:query|mutation) (\w+)/.exec(String(query))?.[1])
    .filter((name) => name !== 'Documents');

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

describe('DocumentDraftEditPage — inline title (JEF-506)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  const titleField = () => screen.findByRole('textbox', { name: /rename draft/i });
  const renameCalls = () =>
    mockGqlRequest.mock.calls.filter(([q]) => String(q).includes('RenameDocumentDraft'));

  it('is an input from the start, showing the title, with the type as placeholder', async () => {
    renderPage();
    const field = await titleField();
    expect(field).toHaveValue('My Resume');
    expect(field).toHaveAttribute('placeholder', 'Resume');
  });

  it('saves a trimmed title on blur', async () => {
    renderPage();
    const field = await titleField();
    fireEvent.change(field, { target: { value: '  Acme resume  ' } });
    fireEvent.blur(field);

    await waitFor(() => expect(renameCalls()).toHaveLength(1));
    expect(renameCalls()[0]![1]).toEqual({ draftId: 'draft-1', title: 'Acme resume' });
    expect(field).toHaveValue('Acme resume');
  });

  it('saves on Enter', async () => {
    renderPage();
    const field = await titleField();
    field.focus();
    fireEvent.change(field, { target: { value: 'Renamed' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(renameCalls()).toHaveLength(1));
  });

  it('puts the previous title back for an empty one, without a request', async () => {
    renderPage();
    const field = await titleField();
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.blur(field);

    expect(field).toHaveValue('My Resume');
    expect(renameCalls()).toHaveLength(0);
  });

  it('sends nothing for an unchanged title', async () => {
    renderPage();
    const field = await titleField();
    fireEvent.blur(field);
    expect(renameCalls()).toHaveLength(0);
  });

  it('reverts and says why when the save fails', async () => {
    mockApi({
      rename: () =>
        Promise.reject({
          response: {
            errors: [{ message: 'Title is taken', extensions: { code: 'VALIDATION_ERROR' } }],
          },
        }),
    });
    renderPage();
    const field = await titleField();
    fireEvent.change(field, { target: { value: 'Other' } });
    fireEvent.blur(field);

    expect(await screen.findByText(/title is taken/i)).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveValue('My Resume'));
  });

  it('makes Export wait for a title save still in flight', async () => {
    let finishRename: (v: unknown) => void = () => {};
    mockApi({ rename: () => new Promise((resolve) => (finishRename = resolve)) });
    renderPage();
    const field = await titleField();
    fireEvent.change(field, { target: { value: 'Other' } });
    fireEvent.blur(field);
    await waitFor(() => expect(renameCalls()).toHaveLength(1));

    await clickExport();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(operations()).not.toContain('ExportDocumentDraftToPdf');

    finishRename({ renameDocumentDraft: { id: 'draft-1' } });
    await waitFor(() => expect(operations()).toContain('ExportDocumentDraftToPdf'));
  });
});

describe('DocumentDraftEditPage — import into an empty draft (JEF-506)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('offers the import while the draft is empty', async () => {
    renderPage();
    expect(await screen.findByText('mock import')).toBeInTheDocument();
  });

  it('hides it once the draft has text', async () => {
    mockGqlRequest.mockImplementation((query: string) =>
      query.includes('query DocumentDraft')
        ? Promise.resolve({ documentDraft: { ...DRAFT, plainText: 'already written' } })
        : Promise.resolve({}),
    );
    renderPage();
    await screen.findByRole('textbox', { name: /rename draft/i });
    expect(screen.queryByText('mock import')).not.toBeInTheDocument();
  });

  it('saves the imported text through the same path as an AI result, keeping the prompt', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('mock import'));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('UpdateDocumentDraftContent'),
        {
          input: {
            draftId: 'draft-1',
            contentJson: '{"imported":true}',
            plainText: 'imported',
            aiInstructions: 'last prompt',
          },
        },
      ),
    );
    // Now it has text, so the import goes away.
    await waitFor(() => expect(screen.queryByText('mock import')).not.toBeInTheDocument());
  });

  it('keeps a failed import save visible, with a retry', async () => {
    mockApi({ save: () => Promise.reject(new Error('offline')) });
    renderPage();
    fireEvent.click(await screen.findByText('mock import'));

    expect(await screen.findByRole('button', { name: /retry save/i })).toBeInTheDocument();
  });
});
