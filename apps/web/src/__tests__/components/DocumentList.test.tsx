import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockCaptureException, mockCaptureEvent, mockPutBlob } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockCaptureException: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockPutBlob: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => <a href={`${to}${params ? '/' + Object.values(params).join('/') : ''}`}>{children}</a>,
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/undoToast', () => ({
  // Sends the operation the call site handed over, instead of running an
  // opaque callback. The request is now described as data so it can be
  // replayed after a refresh (JEF-191), which means this mock also checks
  // that each call site names the right document and variables.
  showUndoToast: vi.fn(
    ({
      operation,
      onSettled,
    }: {
      operation: { document: string; variables?: Record<string, unknown> };
      onSettled?: () => void;
    }) => {
      void Promise.resolve(mockGqlRequest(operation.document, operation.variables))
        .catch(() => {})
        .finally(() => onSettled?.());
    },
  ),
}));

vi.mock('@vercel/blob/client', () => ({
  put: mockPutBlob,
}));

vi.mock('#/lib/analytics', () => ({
  ANALYTICS_EVENTS: { DOCUMENT_UPLOADED: 'document_uploaded' },
  captureException: mockCaptureException,
  captureEvent: mockCaptureEvent,
}));

import { DocumentList } from '#/routes/_authenticated/applications/$applicationId/-components/DocumentList';

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const mockDoc = {
  id: 'doc-1',
  applicationId: 'app-1',
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 102400,
  url: 'https://example.com/resume.pdf',
  documentType: 'resume',
  version: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockDraft = {
  id: 'draft-1',
  applicationId: 'app-1',
  type: 'cover_letter',
  title: 'My cover letter',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function mockResponses(overrides?: { documents?: unknown[]; documentDrafts?: unknown[] }) {
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('DocumentDrafts')) {
      return Promise.resolve({ documentDrafts: overrides?.documentDrafts ?? [] });
    }
    return Promise.resolve({ documents: overrides?.documents ?? [] });
  });
}

describe('DocumentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers an Upload file button when there are no documents', async () => {
    mockResponses();
    render(<DocumentList applicationId="app-1" category="other" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload file' })).toBeInTheDocument();
    });
  });

  it('renders an existing document with its size, without a redundant type badge', async () => {
    mockResponses({ documents: [mockDoc] });
    render(<DocumentList applicationId="app-1" category="resume" />, { wrapper: Wrapper });

    expect(await screen.findByText('resume.pdf')).toBeInTheDocument();
    // The tab already says it is Resumes; a badge would repeat that on every row.
    expect(screen.queryByText('Resume')).not.toBeInTheDocument();
    expect(screen.getByText(/100\.0 KB/)).toBeInTheDocument();
  });

  it('renders an existing document draft with a link to it', async () => {
    mockResponses({ documentDrafts: [mockDraft] });
    render(<DocumentList applicationId="app-1" category="cover_letter" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('My cover letter')).toBeInTheDocument();
    });
    const link = screen.getByText('My cover letter').closest('a')!;
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/applications/$applicationId/documents/$draftId'),
    );
  });

  it('deletes a document', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('DeleteDocument')) return Promise.resolve({ deleteDocument: true });
      if (query.includes('DocumentDrafts')) return Promise.resolve({ documentDrafts: [] });
      return Promise.resolve({ documents: [mockDoc] });
    });
    render(<DocumentList applicationId="app-1" category="resume" />, { wrapper: Wrapper });

    await screen.findByText('resume.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('DeleteDocument'),
        expect.objectContaining({ id: 'doc-1' }),
      );
    });
  });

  it('shows the server quota message when an upload is rejected', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('DocumentDrafts')) return Promise.resolve({ documentDrafts: [] });
      if (query.includes('RequestUploadUrl')) {
        return Promise.reject({
          response: {
            errors: [
              {
                message: 'This application already has the maximum of 10 documents',
                extensions: { code: 'QUOTA_EXCEEDED' },
              },
            ],
          },
        });
      }
      return Promise.resolve({ documents: [] });
    });
    const { container } = render(<DocumentList applicationId="app-1" category="other" />, {
      wrapper: Wrapper,
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upload file' })).toBeInTheDocument(),
    );
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'resume.pdf', { type: 'application/pdf' })] },
    });

    await waitFor(() =>
      expect(
        screen.getByText('This application already has the maximum of 10 documents'),
      ).toBeInTheDocument(),
    );
  });

  describe('upload failure reporting (JEF-358)', () => {
    const BLOB_TOKEN = 'vercel_blob_client_token';
    const LOCAL_URL = 'http://localhost:3001/uploads/_upload/users/u1/key';
    const GENERIC_ERROR = 'Something went wrong. Please try again.';
    const STORAGE_KEY = 'users/u1/applications/app-1/abc-Jane-Doe-CV.pdf';

    /** A graphql-request failure as gqlClient rethrows it after its middleware has run. */
    const serverError = () =>
      Object.assign(new Error('Internal server error'), { response: { status: 500 } });

    function mockUploadFlow({
      uploadUrl = BLOB_TOKEN,
      requestUploadUrl,
      confirmDocument,
    }: {
      uploadUrl?: string;
      requestUploadUrl?: () => Promise<unknown>;
      confirmDocument?: () => Promise<unknown>;
    } = {}) {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('DocumentDrafts')) return Promise.resolve({ documentDrafts: [] });
        if (query.includes('RequestUploadUrl')) {
          return requestUploadUrl
            ? requestUploadUrl()
            : Promise.resolve({ requestUploadUrl: { uploadUrl, storageKey: STORAGE_KEY } });
        }
        if (query.includes('ConfirmDocument')) {
          return confirmDocument
            ? confirmDocument()
            : Promise.resolve({ confirmDocument: mockDoc });
        }
        return Promise.resolve({ documents: [] });
      });
    }

    async function chooseFile(
      file = new File(['pdf'], 'Jane Doe CV.pdf', { type: 'application/pdf' }),
    ) {
      const { container } = render(<DocumentList applicationId="app-1" category="other" />, {
        wrapper: Wrapper,
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Upload file' })).toBeInTheDocument(),
      );
      fireEvent.change(container.querySelector('input[type="file"]')!, {
        target: { files: [file] },
      });
    }

    async function confirmUpload() {
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /confirm upload/i })).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole('button', { name: /confirm upload/i }));
    }

    it('reports a Blob put() failure once, tagged as the storage stage, without the filename', async () => {
      mockUploadFlow();
      const blobError = new Error('Vercel Blob: Access denied, please provide a valid token');
      mockPutBlob.mockRejectedValue(blobError);

      await chooseFile();

      await waitFor(() => expect(screen.getByText(GENERIC_ERROR)).toBeInTheDocument());
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(blobError, {
        kind: 'document_upload_failed',
        stage: 'storage',
        provider: 'blob',
        mime_type: 'application/pdf',
        size_bucket: '<1MB',
      });
      expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain('Jane');
    });

    it('reports a failed local upload as the local provider', async () => {
      mockUploadFlow({ uploadUrl: LOCAL_URL });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 413 }));

      await chooseFile();

      await waitFor(() => expect(screen.getByText(GENERIC_ERROR)).toBeInTheDocument());
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ stage: 'storage', provider: 'local' }),
      );
      expect(mockPutBlob).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('leaves a requestUploadUrl failure to gqlClient, which already reported it', async () => {
      mockUploadFlow({ requestUploadUrl: () => Promise.reject(serverError()) });

      await chooseFile();

      await waitFor(() => expect(screen.getByText(GENERIC_ERROR)).toBeInTheDocument());
      expect(mockPutBlob).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('does not report a 5xx from confirmDocument a second time', async () => {
      mockUploadFlow({ confirmDocument: () => Promise.reject(serverError()) });
      mockPutBlob.mockResolvedValue({});

      await chooseFile();
      await confirmUpload();

      await waitFor(() => expect(screen.getByText(GENERIC_ERROR)).toBeInTheDocument());
      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockCaptureEvent).not.toHaveBeenCalled();
    });

    it('fires document_uploaded with the type and MIME only after a successful confirm', async () => {
      mockUploadFlow();
      mockPutBlob.mockResolvedValue({});

      await chooseFile();
      await confirmUpload();

      await waitFor(() => expect(mockCaptureEvent).toHaveBeenCalledTimes(1));
      expect(mockCaptureEvent).toHaveBeenCalledWith('document_uploaded', {
        document_type: 'other',
        mime_type: 'application/pdf',
      });
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });
});

describe('DocumentList — one category per tab (JEF-396)', () => {
  const doc = (id: string, name: string, documentType: string) => ({
    ...mockDoc,
    id,
    name,
    documentType,
  });
  const draft = (id: string, title: string, type: string) => ({ ...mockDraft, id, title, type });

  const documents = [
    doc('d-r', 'resume.pdf', 'resume'),
    doc('d-c', 'letter.pdf', 'cover_letter'),
    doc('d-p', 'portfolio.pdf', 'portfolio'),
    doc('d-o', 'notes.pdf', 'other'),
    doc('d-x', 'mystery.pdf', 'some_future_type'),
  ];
  const documentDrafts = [
    draft('dr-r', 'Resume draft', 'resume'),
    draft('dr-c', 'Cover letter draft', 'cover_letter'),
  ];

  const ALL = [
    'resume.pdf',
    'letter.pdf',
    'portfolio.pdf',
    'notes.pdf',
    'mystery.pdf',
    'Resume draft',
    'Cover letter draft',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockResponses({ documents, documentDrafts });
  });

  const shown = (names: string[]) => names.filter((n) => screen.queryByText(n) !== null);

  it.each([
    ['resume', ['resume.pdf', 'Resume draft']],
    ['cover_letter', ['letter.pdf', 'Cover letter draft']],
    ['other', ['portfolio.pdf', 'notes.pdf', 'mystery.pdf']],
  ] as const)('shows only %s items, drafts and uploads together', async (category, expected) => {
    render(<DocumentList applicationId="app-1" category={category} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(expected[0])).toBeInTheDocument());
    expect(shown(ALL).sort()).toEqual([...expected].sort());
  });

  it('puts every item in exactly one tab', async () => {
    const seen: string[] = [];
    for (const category of ['cover_letter', 'resume', 'other'] as const) {
      const { unmount } = render(<DocumentList applicationId="app-1" category={category} />, {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(shown(ALL).length).toBeGreaterThan(0));
      seen.push(...shown(ALL));
      unmount();
    }
    expect(seen.sort()).toEqual([...ALL].sort());
  });

  it('badges portfolio files on Other, the one tab that mixes types', async () => {
    render(<DocumentList applicationId="app-1" category="other" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('portfolio.pdf')).toBeInTheDocument());
    expect(screen.getByText('Portfolio')).toBeInTheDocument();
  });

  it('shows a per-category empty state', async () => {
    mockResponses({ documents: [doc('d-r', 'resume.pdf', 'resume')] });
    render(<DocumentList applicationId="app-1" category="cover_letter" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('No cover letters yet')).toBeInTheDocument());
  });

  it('links each draftable tab to its own create form and gives Other none', async () => {
    const hrefOfNewDraft = async (category: 'cover_letter' | 'resume' | 'other') => {
      const { unmount } = render(<DocumentList applicationId="app-1" category={category} />, {
        wrapper: Wrapper,
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Upload file' })).toBeInTheDocument(),
      );
      const link = screen.queryByText('New Draft')?.closest('a') ?? null;
      const href = link?.getAttribute('href') ?? null;
      unmount();
      return href;
    };

    expect(await hrefOfNewDraft('cover_letter')).toContain('/cover-letters/new');
    expect(await hrefOfNewDraft('resume')).toContain('/resumes/new');
    expect(await hrefOfNewDraft('other')).toBeNull();
  });

  describe('upload type', () => {
    const uploadWithin = async (category: 'cover_letter' | 'resume' | 'other') => {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('DocumentDrafts')) return Promise.resolve({ documentDrafts: [] });
        if (query.includes('RequestUploadUrl'))
          return Promise.resolve({ requestUploadUrl: { uploadUrl: 'tok', storageKey: 'k' } });
        if (query.includes('ConfirmDocument')) return Promise.resolve({ confirmDocument: mockDoc });
        return Promise.resolve({ documents: [] });
      });
      mockPutBlob.mockResolvedValue({});
      const { container } = render(<DocumentList applicationId="app-1" category={category} />, {
        wrapper: Wrapper,
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Upload file' })).toBeInTheDocument(),
      );
      fireEvent.change(container.querySelector('input[type="file"]')!, {
        target: { files: [new File(['pdf'], 'x.pdf', { type: 'application/pdf' })] },
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /confirm upload/i })).toBeInTheDocument(),
      );
    };

    it.each(['resume', 'cover_letter'] as const)(
      'saves %s uploads with that type and never asks for one',
      async (category) => {
        await uploadWithin(category);
        expect(screen.queryByLabelText(/document type/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /confirm upload/i }));
        await waitFor(() =>
          expect(mockGqlRequest).toHaveBeenCalledWith(
            expect.stringContaining('ConfirmDocument'),
            expect.objectContaining({
              input: expect.objectContaining({ documentType: category }),
            }),
          ),
        );
      },
    );

    it('offers Other only the types that stay in it, so a file cannot vanish into another tab', async () => {
      await uploadWithin('other');

      const options = within(screen.getByRole('combobox'))
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value);
      expect(options).toEqual(['other', 'portfolio']);
    });
  });
});

describe('DocumentList — resume match (JEF-397)', () => {
  const resumeDraft = { ...mockDraft, id: 'draft-r', type: 'resume', title: 'My CV' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers a match on every resume, drafts and uploads alike', async () => {
    mockResponses({ documents: [mockDoc], documentDrafts: [resumeDraft] });
    render(<DocumentList applicationId="app-1" category="resume" />, { wrapper: Wrapper });

    await screen.findByText('My CV');
    await screen.findByText('resume.pdf');
    expect(await screen.findAllByRole('button', { name: /generate match/i })).toHaveLength(2);
  });

  it('does not offer a match on cover letters or other documents', async () => {
    mockResponses({
      documents: [{ ...mockDoc, documentType: 'other', name: 'notes.pdf' }],
      documentDrafts: [mockDraft],
    });
    const { unmount } = render(<DocumentList applicationId="app-1" category="cover_letter" />, {
      wrapper: Wrapper,
    });
    await screen.findByText('My cover letter');
    expect(screen.queryByRole('button', { name: /generate match/i })).not.toBeInTheDocument();
    unmount();

    render(<DocumentList applicationId="app-1" category="other" />, { wrapper: Wrapper });
    await screen.findByText('notes.pdf');
    expect(screen.queryByRole('button', { name: /generate match/i })).not.toBeInTheDocument();
  });

  it('points an empty Resumes section at creating or uploading one, with no match button', async () => {
    mockResponses();
    render(<DocumentList applicationId="app-1" category="resume" />, { wrapper: Wrapper });

    expect(await screen.findByText(/create or upload one/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate match/i })).not.toBeInTheDocument();
  });
});

describe('DocumentList — one unified list (JEF-399)', () => {
  const resumeDraft = {
    ...mockDraft,
    id: 'draft-r',
    type: 'resume',
    title: 'Tailored for Acme',
    updatedAt: '2024-03-01T00:00:00.000Z',
  };
  const resumeFile = { ...mockDoc, name: 'resume.pdf', createdAt: '2024-02-01T00:00:00.000Z' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mixes drafts and files in one list, newest first, each marked by kind', async () => {
    mockResponses({ documents: [resumeFile], documentDrafts: [resumeDraft] });
    render(<DocumentList applicationId="app-1" category="resume" />, { wrapper: Wrapper });

    await screen.findByText('resume.pdf');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Tailored for Acme')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Draft')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(within(rows[1]).getByText('resume.pdf')).toBeInTheDocument();
    expect(within(rows[1]).getByText('PDF')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('Draft')).not.toBeInTheDocument();
  });

  it('filters between drafts and files, with counts', async () => {
    mockResponses({ documents: [resumeFile], documentDrafts: [resumeDraft] });
    render(<DocumentList applicationId="app-1" category="resume" />, { wrapper: Wrapper });
    await screen.findByText('resume.pdf');

    expect(screen.getByRole('button', { name: 'All 2' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Drafts 1' }));
    expect(screen.queryByText('resume.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Tailored for Acme')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Files 1' }));
    expect(screen.getByText('resume.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Tailored for Acme')).not.toBeInTheDocument();
  });

  it('hides the filter while only one kind of item exists', async () => {
    mockResponses({ documents: [resumeFile] });
    const { unmount } = render(<DocumentList applicationId="app-1" category="resume" />, {
      wrapper: Wrapper,
    });
    await screen.findByText('resume.pdf');
    expect(screen.queryByRole('group', { name: 'Filter' })).not.toBeInTheDocument();
    unmount();

    mockResponses({ documentDrafts: [resumeDraft] });
    render(<DocumentList applicationId="app-1" category="resume" />, { wrapper: Wrapper });
    await screen.findByText('Tailored for Acme');
    expect(screen.queryByRole('group', { name: 'Filter' })).not.toBeInTheDocument();
  });

  it('shows the whole list again once the filtered kind disappears', async () => {
    mockResponses({ documents: [resumeFile], documentDrafts: [resumeDraft] });
    render(<DocumentList applicationId="app-1" category="resume" />, { wrapper: Wrapper });
    await screen.findByText('resume.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Drafts 1' }));
    mockResponses({ documents: [resumeFile] });
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(await screen.findByText('resume.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter' })).not.toBeInTheDocument();
  });

  it('no longer renders an always-open dropzone', async () => {
    mockResponses();
    render(<DocumentList applicationId="app-1" category="resume" />, { wrapper: Wrapper });
    await screen.findByText(/create or upload one/i);
    expect(screen.queryByText(/click to upload/i)).not.toBeInTheDocument();
  });

  it('opens the file picker from the Upload file button', async () => {
    mockResponses();
    const { container } = render(<DocumentList applicationId="app-1" category="resume" />, {
      wrapper: Wrapper,
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Upload file' }));
    expect(click).toHaveBeenCalled();
  });
});
