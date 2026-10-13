import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The open section lives in the URL now (JEF-208), so the router mock has to
// be a real (tiny) store rather than a no-op: `useSearch` reads it, and
// `useNavigate` writes it, which is what makes clicking a section re-render
// the page the way the router would.
const { mockNavigate, mockGqlRequest, searchStore } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const store = {
    value: {} as { section?: string },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get() {
      return store.value;
    },
    set(v: { section?: string }) {
      store.value = v;
      listeners.forEach((l) => l());
    },
  };
  return {
    mockGqlRequest: vi.fn(),
    searchStore: store,
    mockNavigate: vi.fn((opts?: { to?: string; search?: { section?: string } }) => {
      if (opts?.search) store.set(opts.search);
    }),
  };
});

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react');
  return {
    createFileRoute: () => (opts: Record<string, unknown>) => ({
      ...opts,
      useParams: () => ({ applicationId: 'app-test-id' }),
      useSearch: () =>
        React.useSyncExternalStore(searchStore.subscribe, searchStore.get, searchStore.get),
    }),
    useNavigate: () => mockNavigate,
    Link: ({
      children,
      to,
      params,
    }: {
      children: React.ReactNode;
      to: string;
      params?: Record<string, string>;
    }) => <a href={`${to}${params ? '/' + Object.values(params).join('/') : ''}`}>{children}</a>,
  };
});

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
  showUndoableActionToast: vi.fn(),
}));

import { ApplicationDetailPage } from '#/routes/_authenticated/applications/$applicationId/-components/ApplicationDetailPage';

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const mockApp = {
  id: 'app-test-id',
  company: 'Stripe',
  role: 'Software Engineer',
  status: 'applied',
  jobUrl: 'https://stripe.com/jobs/1',
  location: 'Remote',
  salaryRange: '$150k',
  description: 'Great role',
  appliedAt: '2024-03-01T00:00:00.000Z',
  starred: false,
  source: null,
  followUpAt: null,
  tags: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockNotes = [
  {
    id: 'note-1',
    applicationId: 'app-test-id',
    content: 'Great first interview',
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  },
];

describe('ApplicationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchStore.set({});
  });

  it('shows loading skeleton when data is not yet available', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    // Loading state - skeleton is shown, no app data
    expect(screen.queryByText('Stripe')).not.toBeInTheDocument();
  });

  it('renders application company and role when data loads', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('Notes')) return Promise.resolve({ notes: [] });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
    });
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
  });

  it('renders application metadata', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('Notes')) return Promise.resolve({ notes: [] });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Remote')).toBeInTheDocument();
    });
    expect(screen.getByText('$150k')).toBeInTheDocument();
  });

  it('renders existing notes', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('Notes')) return Promise.resolve({ notes: mockNotes });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Great first interview')).toBeInTheDocument();
    });
  });

  it('submits a new note', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('CreateNote')) {
        return Promise.resolve({
          createNote: {
            id: 'note-2',
            applicationId: 'app-test-id',
            content: 'New note',
            createdAt: '2024-01-03T00:00:00.000Z',
            updatedAt: '2024-01-03T00:00:00.000Z',
          },
        });
      }
      if (query.includes('Notes')) return Promise.resolve({ notes: [] });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/add a note/i);
    fireEvent.change(textarea, { target: { value: 'New note content' } });
    fireEvent.click(screen.getByRole('button', { name: /add note/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('CreateNote'),
        expect.objectContaining({ content: 'New note content' }),
      );
    });
  });

  it('shows the notes tab and the three document tabs, with no combined Documents tab', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('Notes')) return Promise.resolve({ notes: [] });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
    });

    const nav = within(screen.getByLabelText('Section navigation'));
    expect(nav.getByRole('button', { name: /notes/i })).toBeInTheDocument();
    expect(nav.getByRole('button', { name: /^cover letters/i })).toBeInTheDocument();
    expect(nav.getByRole('button', { name: /^resumes/i })).toBeInTheDocument();
    expect(nav.getByRole('button', { name: /^other documents/i })).toBeInTheDocument();
    expect(nav.queryByRole('button', { name: /^documents/i })).not.toBeInTheDocument();
    expect(nav.queryByRole('button', { name: /^cover letter$/i })).not.toBeInTheDocument();
  });

  it('switches to the other documents tab and shows upload area', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('Documents')) return Promise.resolve({ documents: [] });
      if (query.includes('Notes')) return Promise.resolve({ notes: [] });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
    });

    fireEvent.click(
      within(screen.getByLabelText('Section navigation')).getByRole('button', {
        name: /other documents/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/click to upload/i)).toBeInTheDocument();
    });
  });

  it('renders existing documents in the other documents tab', async () => {
    const mockDoc = {
      id: 'doc-1',
      applicationId: 'app-test-id',
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 102400,
      url: 'https://example.com/resume.pdf',
      createdAt: '2024-01-02T00:00:00.000Z',
    };
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('Documents')) return Promise.resolve({ documents: [mockDoc] });
      if (query.includes('Notes')) return Promise.resolve({ notes: [] });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
    });

    fireEvent.click(
      within(screen.getByLabelText('Section navigation')).getByRole('button', {
        name: /other documents/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('resume.pdf')).toBeInTheDocument();
    });
  });

  describe('document previews (JEF-70)', () => {
    const mockPdfDoc = {
      id: 'doc-1',
      applicationId: 'app-test-id',
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 102400,
      url: 'https://example.com/resume.pdf',
      documentType: 'resume',
      createdAt: '2024-01-02T00:00:00.000Z',
    };
    const mockImageDoc = {
      id: 'doc-2',
      applicationId: 'app-test-id',
      name: 'portfolio.png',
      mimeType: 'image/png',
      sizeBytes: 51200,
      url: 'https://example.com/portfolio.png',
      documentType: 'portfolio',
      createdAt: '2024-01-02T00:00:00.000Z',
    };
    const mockDocxDoc = {
      id: 'doc-3',
      applicationId: 'app-test-id',
      name: 'cover-letter.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 20480,
      url: 'https://example.com/cover-letter.docx',
      documentType: 'cover_letter',
      createdAt: '2024-01-02T00:00:00.000Z',
    };

    it('opens an inline PDF preview when clicking a PDF document name', async () => {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('Documents')) return Promise.resolve({ documents: [mockPdfDoc] });
        if (query.includes('Notes')) return Promise.resolve({ notes: [] });
        return Promise.resolve({ application: mockApp });
      });
      render(<ApplicationDetailPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

      fireEvent.click(
        within(screen.getByLabelText('Section navigation')).getByRole('button', {
          name: /resumes/i,
        }),
      );
      await waitFor(() => expect(screen.getByText('resume.pdf')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'resume.pdf' }));

      const iframe = await screen.findByTitle('resume.pdf');
      expect(iframe).toHaveAttribute('src', mockPdfDoc.url);
    });

    it('opens an inline image preview when clicking an image document name', async () => {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('Documents')) return Promise.resolve({ documents: [mockImageDoc] });
        if (query.includes('Notes')) return Promise.resolve({ notes: [] });
        return Promise.resolve({ application: mockApp });
      });
      render(<ApplicationDetailPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

      fireEvent.click(
        within(screen.getByLabelText('Section navigation')).getByRole('button', {
          name: /other documents/i,
        }),
      );
      await waitFor(() => expect(screen.getByText('portfolio.png')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'portfolio.png' }));

      const img = await screen.findByAltText('portfolio.png');
      expect(img).toHaveAttribute('src', mockImageDoc.url);
    });

    it('closes the preview modal when the close button is clicked', async () => {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('Documents')) return Promise.resolve({ documents: [mockPdfDoc] });
        if (query.includes('Notes')) return Promise.resolve({ notes: [] });
        return Promise.resolve({ application: mockApp });
      });
      render(<ApplicationDetailPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
      fireEvent.click(
        within(screen.getByLabelText('Section navigation')).getByRole('button', {
          name: /resumes/i,
        }),
      );
      await waitFor(() => expect(screen.getByText('resume.pdf')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'resume.pdf' }));
      await screen.findByTitle('resume.pdf');

      const dialog = screen.getByTitle('resume.pdf').closest('div')!.parentElement!;
      const closeButton = within(dialog).getAllByRole('button').at(-1)!;
      fireEvent.click(closeButton);

      expect(screen.queryByTitle('resume.pdf')).not.toBeInTheDocument();
    });

    it('does not make non-previewable documents (e.g. .docx) clickable, and keeps the download link', async () => {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('Documents')) return Promise.resolve({ documents: [mockDocxDoc] });
        if (query.includes('Notes')) return Promise.resolve({ notes: [] });
        return Promise.resolve({ application: mockApp });
      });
      render(<ApplicationDetailPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

      fireEvent.click(
        within(screen.getByLabelText('Section navigation')).getByRole('button', {
          name: /cover letters/i,
        }),
      );
      await waitFor(() => expect(screen.getByText('cover-letter.docx')).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: 'cover-letter.docx' })).not.toBeInTheDocument();
      const link = screen.getByRole('link', { name: 'cover-letter.docx' });
      expect(link).toHaveAttribute('href', mockDocxDoc.url);
    });
  });

  describe('resume match inside the Resumes section (JEF-397)', () => {
    const mockPdfResume = {
      id: 'doc-1',
      applicationId: 'app-test-id',
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 102400,
      url: 'https://example.com/resume.pdf',
      documentType: 'resume',
      createdAt: '2024-01-02T00:00:00.000Z',
    };

    const openResumes = async (documents: unknown[]) => {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('Documents')) return Promise.resolve({ documents });
        if (query.includes('Notes')) return Promise.resolve({ notes: [] });
        return Promise.resolve({ application: mockApp });
      });
      render(<ApplicationDetailPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

      fireEvent.click(
        within(screen.getByLabelText('Section navigation')).getByRole('button', {
          name: /^resumes/i,
        }),
      );
    };

    it('has no standalone Resume Match section', async () => {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('Notes')) return Promise.resolve({ notes: [] });
        return Promise.resolve({ application: mockApp });
      });
      render(<ApplicationDetailPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

      expect(
        within(screen.getByLabelText('Section navigation')).queryByRole('button', {
          name: /resume match/i,
        }),
      ).not.toBeInTheDocument();
    });

    it('offers to generate a match on an uploaded resume', async () => {
      await openResumes([mockPdfResume]);

      expect(await screen.findByText('resume.pdf')).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /generate match/i })).toBeInTheDocument();
    });
  });

  it('enters edit mode for a note', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('Notes')) return Promise.resolve({ notes: mockNotes });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Great first interview')).toBeInTheDocument();
    });

    // Click the edit button (first icon button inside the note card)
    const noteText = screen.getByText('Great first interview');
    const noteCard = noteText.closest('div[class*="bg-white"]') as HTMLElement;
    const noteButtons = within(noteCard).getAllByRole('button');
    fireEvent.click(noteButtons[0]); // edit button

    // Editing textarea appears with existing content
    await waitFor(() => {
      const editTextarea = screen.getByDisplayValue('Great first interview');
      expect(editTextarea.tagName).toBe('TEXTAREA');
    });
  });

  it('saves an edited note', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('UpdateNote'))
        return Promise.resolve({
          updateNote: { ...mockNotes[0], content: 'Updated note' },
        });
      if (query.includes('Notes')) return Promise.resolve({ notes: mockNotes });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Great first interview')).toBeInTheDocument();
    });

    // Enter edit mode
    const noteCard = screen
      .getByText('Great first interview')
      .closest('div[class*="bg-white"]') as HTMLElement;
    fireEvent.click(within(noteCard).getAllByRole('button')[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Great first interview')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('Great first interview'), {
      target: { value: 'Updated note' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('UpdateNote'),
        expect.objectContaining({ id: 'note-1', content: 'Updated note' }),
      );
    });
  });

  it('deletes a note', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('DeleteNote')) return Promise.resolve({ deleteNote: true });
      if (query.includes('Notes')) return Promise.resolve({ notes: mockNotes });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Great first interview')).toBeInTheDocument();
    });

    const noteCard = screen
      .getByText('Great first interview')
      .closest('div[class*="bg-white"]') as HTMLElement;
    const noteButtons = within(noteCard).getAllByRole('button');
    fireEvent.click(noteButtons[1]); // delete button

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('DeleteNote'),
        expect.objectContaining({ id: 'note-1' }),
      );
    });
  });

  it('deletes the application and leaves the page at once, without an undo window', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('DeleteApplication')) return Promise.resolve({ deleteApplication: true });
      if (query.includes('Notes')) return Promise.resolve({ notes: [] });
      return Promise.resolve({ application: mockApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
    });

    // Star, edit and delete live behind the single header trigger now.
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete application' }),
    );

    // Synchronously, in the click handler — not after the request resolves and
    // not after a timer. This is the reported bug: the redirect used to be
    // gated on a mutation that was itself gated on a 5s timeout.
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/applications' });

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('DeleteApplication'),
        expect.objectContaining({ id: 'app-test-id' }),
      );
    });
  });
});

describe('ApplicationDetailPage — section index (JEF-208)', () => {
  const counts = {
    notes: 3,
    interviews: 2,
    contacts: 0,
    offers: 0,
  };

  const respond = (extra: (query: string) => unknown = () => undefined) =>
    mockGqlRequest.mockImplementation((query: string) => {
      const custom = extra(query);
      if (custom !== undefined) return custom;
      if (query.includes('ApplicationSectionCounts'))
        return Promise.resolve({ application: { id: 'app-test-id', sectionCounts: counts } });
      if (query.includes('DocumentDrafts')) return Promise.resolve({ documentDrafts: [] });
      if (query.includes('query Documents')) return Promise.resolve({ documents: [] });
      if (query.includes('Notes')) return Promise.resolve({ notes: [] });
      return Promise.resolve({ application: mockApp });
    });

  beforeEach(() => {
    vi.clearAllMocks();
    searchStore.set({});
  });

  it('badges each section with its count, and leaves an empty one unbadged', async () => {
    respond();
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    const nav = screen.getByLabelText('Section navigation');
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: /notes 3/i })).toBeInTheDocument(),
    );
    expect(within(nav).getByRole('button', { name: /interviews 2/i })).toBeInTheDocument();
    // Zero is not a badge saying "0" — the row just reads quieter.
    expect(within(nav).getByRole('button', { name: /^contacts$/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /contacts 0/i })).not.toBeInTheDocument();
  });

  it('badges each document tab with its own category, drafts and uploads together', async () => {
    const upload = (id: string, documentType: string) => ({
      id,
      applicationId: 'app-test-id',
      name: `${id}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      url: `https://example.com/${id}.pdf`,
      documentType,
      version: null,
      createdAt: '2024-01-02T00:00:00.000Z',
    });
    const draft = (id: string, type: string) => ({
      id,
      applicationId: 'app-test-id',
      type,
      title: id,
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    });
    respond((query) => {
      if (query.includes('DocumentDrafts'))
        return Promise.resolve({
          documentDrafts: [draft('d1', 'cover_letter'), draft('d2', 'resume')],
        });
      if (query.includes('query Documents'))
        return Promise.resolve({
          documents: [upload('u1', 'resume'), upload('u2', 'portfolio'), upload('u3', 'other')],
        });
      return undefined;
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    const nav = screen.getByLabelText('Section navigation');
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: /cover letters 1/i })).toBeInTheDocument(),
    );
    expect(within(nav).getByRole('button', { name: /resumes 2/i })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /other documents 2/i })).toBeInTheDocument();
  });

  it('groups the sections under Track, Documents & AI and Outcome', async () => {
    respond();
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    const nav = screen.getByLabelText('Section navigation');
    expect(within(nav).getByText('Track')).toBeInTheDocument();
    expect(within(nav).getByText('Documents & AI')).toBeInTheDocument();
    expect(within(nav).getByText('Outcome')).toBeInTheDocument();
  });

  it('opens on the section named in the URL', async () => {
    searchStore.set({ section: 'offers' });
    respond();
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Offer comparison')).toBeInTheDocument());
    // ...and not on the default section.
    expect(screen.queryByPlaceholderText(/add a note/i)).not.toBeInTheDocument();
  });

  it('puts the chosen section in the URL rather than in component state', async () => {
    respond();
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    fireEvent.click(
      within(screen.getByLabelText('Section navigation')).getByRole('button', {
        name: /interviews/i,
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/applications/$applicationId',
      params: { applicationId: 'app-test-id' },
      search: { section: 'interviews' },
    });
    expect(searchStore.get()).toEqual({ section: 'interviews' });
  });

  it('leaves the section, not the application, when the phone back button is used', async () => {
    searchStore.set({ section: 'interviews' });
    respond();
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Back to sections' }));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/applications/$applicationId',
      params: { applicationId: 'app-test-id' },
      search: {},
    });
    expect(searchStore.get()).toEqual({});
  });

  it('falls back to Notes when the URL names no section', async () => {
    respond();
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByPlaceholderText(/add a note/i)).toBeInTheDocument());
  });

  it('stars the application from the actions sheet', async () => {
    respond((query) =>
      query.includes('UpdateApplication')
        ? Promise.resolve({ updateApplication: { id: 'app-test-id', starred: true } })
        : undefined,
    );
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Star' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('UpdateApplication'),
        expect.objectContaining({ id: 'app-test-id', input: { starred: true } }),
      ),
    );
    // The sheet closes behind the action rather than sitting over the page.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('changes status from the actions sheet, showing the current one as chosen', async () => {
    respond((query) =>
      query.includes('UpdateApplication')
        ? Promise.resolve({
            updateApplication: { id: 'app-test-id', starred: false, status: 'interviewing' },
          })
        : undefined,
    );
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const sheet = () => screen.getByRole('dialog');
    fireEvent.click(within(sheet()).getByRole('button', { name: /change status/i }));

    // The status it is already on is marked, not offered as a change.
    expect(within(sheet()).getByRole('button', { name: 'Applied' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Interviewing' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('UpdateApplication'),
        expect.objectContaining({ id: 'app-test-id', input: { status: 'interviewing' } }),
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reopens the actions sheet on its first pane, not on the status list', async () => {
    respond();
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /change status/i }),
    );
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Applied' }));

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: /change status/i }),
    ).toBeInTheDocument();
  });

  it('offers an edit link from the actions sheet', async () => {
    respond();
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/applications/$applicationId/edit/app-test-id',
    );
  });

  it('refreshes the counts when a note is added, so a badge cannot go stale', async () => {
    respond((query) =>
      query.includes('CreateNote')
        ? Promise.resolve({
            createNote: {
              id: 'note-2',
              applicationId: 'app-test-id',
              content: 'New note',
              createdAt: '2024-01-03T00:00:00.000Z',
              updatedAt: '2024-01-03T00:00:00.000Z',
            },
          })
        : undefined,
    );
    render(<ApplicationDetailPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());

    const countsCalls = () =>
      mockGqlRequest.mock.calls.filter(([q]) => String(q).includes('ApplicationSectionCounts'))
        .length;
    await waitFor(() => expect(countsCalls()).toBe(1));

    fireEvent.change(screen.getByPlaceholderText(/add a note/i), {
      target: { value: 'New note content' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add note/i }));

    await waitFor(() => expect(countsCalls()).toBe(2));
  });

  it('does not ask for counts on a trashed application', async () => {
    mockGqlRequest.mockResolvedValue({
      application: { ...mockApp, deletedAt: '2026-08-15T12:00:00.000Z' },
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText('This application is in Trash')).toBeInTheDocument(),
    );
    const queries = mockGqlRequest.mock.calls.map(([query]) => String(query));
    expect(queries.some((q) => q.includes('ApplicationSectionCounts'))).toBe(false);
  });
});

describe('ApplicationDetailPage — trashed application', () => {
  const trashedApp = {
    ...mockApp,
    deletedAt: '2026-08-15T12:00:00.000Z',
    purgeAt: '2026-09-14T12:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    searchStore.set({});
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the read-only Trash view instead of the editable detail page', async () => {
    mockGqlRequest.mockResolvedValue({ application: trashedApp });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText('This application is in Trash')).toBeInTheDocument(),
    );
    expect(screen.getByText('Deletes in 25 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete forever' })).toBeInTheDocument();
    // The editable surface is gone: no note composer, no tab strip.
    expect(screen.queryByPlaceholderText(/note/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Interviews')).not.toBeInTheDocument();
  });

  it('does not fetch the panels that would 404 for a trashed application', async () => {
    mockGqlRequest.mockResolvedValue({ application: trashedApp });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText('This application is in Trash')).toBeInTheDocument(),
    );
    // Notes and the health score both resolve through the trash-filtered
    // findById on the server, so firing them would only produce NOT_FOUND.
    const queries = mockGqlRequest.mock.calls.map(([query]) => String(query));
    expect(queries.some((q) => q.includes('query Notes'))).toBe(false);
    expect(queries.some((q) => q.includes('ApplicationHealthScore'))).toBe(false);
  });

  it('restores from the banner', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('RestoreApplication'))
        return Promise.resolve({ restoreApplication: true });
      return Promise.resolve({ application: trashedApp });
    });
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RestoreApplication'), {
        id: 'app-test-id',
      }),
    );
  });

  it('permanently deletes from the banner and returns to Trash', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('PermanentlyDeleteApplication'))
        return Promise.resolve({ permanentlyDeleteApplication: true });
      return Promise.resolve({ application: trashedApp });
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ApplicationDetailPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete forever' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/applications/trash' }));
  });
});
