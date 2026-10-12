import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockNavigate } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { CoverLettersTab } from '#/routes/_authenticated/applications/$applicationId/-components/CoverLettersTab';

const makeClient = () =>
  new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const savedLetter = {
  id: 'draft-1',
  type: 'cover_letter',
  title: 'Acme — Engineer (2026-08-21)',
  updatedAt: '2026-08-21T00:00:00.000Z',
};

/** Everything not a cover letter belongs to another tab, not this one. */
const resumeDraft = {
  id: 'draft-2',
  type: 'resume',
  title: 'My resume',
  updatedAt: '2026-08-21T00:00:00.000Z',
};

const respondWith = (drafts: unknown[], generated?: { id: string }) =>
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('GenerateCoverLetter'))
      return Promise.resolve({ generateCoverLetter: generated ?? { id: 'draft-new' } });
    return Promise.resolve({ documentDrafts: drafts });
  });

describe('CoverLettersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists cover letters saved previously', async () => {
    // The point of JEF-195: a letter generated in an earlier session is still
    // here, rather than having lived in component state.
    respondWith([savedLetter]);
    render(<CoverLettersTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText('Acme — Engineer (2026-08-21)')).toBeInTheDocument(),
    );
  });

  it('leaves resume drafts to the Resumes tab', async () => {
    respondWith([savedLetter, resumeDraft]);
    render(<CoverLettersTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText('Acme — Engineer (2026-08-21)')).toBeInTheDocument(),
    );
    expect(screen.queryByText('My resume')).not.toBeInTheDocument();
  });

  it('shows an empty state before anything has been generated', async () => {
    respondWith([]);
    render(<CoverLettersTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('No cover letters yet')).toBeInTheDocument());
  });

  it('generates a letter and opens it in the editor', async () => {
    respondWith([], { id: 'draft-new' });
    render(<CoverLettersTab applicationId="app-1" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button', { name: /generate cover letter/i }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('GenerateCoverLetter'),
        expect.objectContaining({ applicationId: 'app-1', resumeText: null }),
      ),
    );
    // Saved, so the useful destination is the editor rather than a copy button.
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/applications/$applicationId/documents/$draftId',
        params: { applicationId: 'app-1', draftId: 'draft-new' },
      }),
    );
  });

  it('passes pasted resume text through to the mutation', async () => {
    respondWith([]);
    render(<CoverLettersTab applicationId="app-1" />, { wrapper: Wrapper });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My background' } });
    fireEvent.click(screen.getByRole('button', { name: /generate cover letter/i }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('GenerateCoverLetter'),
        expect.objectContaining({ resumeText: 'My background' }),
      ),
    );
  });

  it('shows a link to Account settings when the AI key is not configured', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('GenerateCoverLetter'))
        return Promise.reject({
          response: { errors: [{ extensions: { code: 'AI_NOT_CONFIGURED' } }] },
        });
      return Promise.resolve({ documentDrafts: [] });
    });
    render(<CoverLettersTab applicationId="app-1" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button', { name: /generate cover letter/i }));

    await waitFor(() =>
      // The href, not just the presence: before JEF-204 these pointed at
      // /settings/profile, which has never had AI settings on it.
      expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute(
        'href',
        '/settings/ai',
      ),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate away when generation fails', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('GenerateCoverLetter')) return Promise.reject(new Error('rate limited'));
      return Promise.resolve({ documentDrafts: [] });
    });
    render(<CoverLettersTab applicationId="app-1" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button', { name: /generate cover letter/i }));

    await waitFor(() => expect(screen.getByText(/rate limited/i)).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
