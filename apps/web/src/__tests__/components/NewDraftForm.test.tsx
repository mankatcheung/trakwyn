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

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import {
  NewDraftForm,
  type DraftType,
} from '#/routes/_authenticated/applications/$applicationId/-components/NewDraftForm';

const renderForm = async (type: DraftType) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NewDraftForm applicationId="app-1" type={type} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
};

describe('NewDraftForm — no type to choose (JEF-396)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue({ documents: [] });
  });

  it.each([
    ['cover_letter', 'New cover letter'],
    ['resume', 'New resume'],
  ] as const)('titles the %s form for what it creates', async (type, heading) => {
    await renderForm(type);

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it.each(['cover_letter', 'resume'] as const)(
    'has no type toggle on the %s form',
    async (type) => {
      await renderForm(type);

      expect(screen.queryByText(/^type$/i)).not.toBeInTheDocument();
      // The old toggle was a pair of buttons named for each type.
      expect(screen.queryByRole('button', { name: /^cover letter$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^resume$/i })).not.toBeInTheDocument();
    },
  );

  it.each(['cover_letter', 'resume'] as const)(
    'creates the draft with the type the form was opened for (%s)',
    async (type) => {
      mockGqlRequest.mockImplementation((query: string) => {
        if (query.includes('CreateDocumentDraft'))
          return Promise.resolve({
            createDocumentDraft: { id: 'draft-1', applicationId: 'app-1' },
          });
        return Promise.resolve({ documents: [] });
      });
      await renderForm(type);

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Acme' } });
      fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('CreateDocumentDraft'),
          expect.objectContaining({ input: expect.objectContaining({ type, title: 'Acme' }) }),
        ),
      );
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith({
          to: '/applications/$applicationId/documents/$draftId',
          params: { applicationId: 'app-1', draftId: 'draft-1' },
        }),
      );
    },
  );

  it('returns Cancel to the tab the draft belongs in', async () => {
    await renderForm('cover_letter');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/applications/$applicationId',
      params: { applicationId: 'app-1' },
      search: { section: 'cover-letters' },
    });
  });
});

describe('NewDraftForm — blank drafts only (JEF-506)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('CreateDocumentDraft'))
        return Promise.resolve({ createDocumentDraft: { id: 'draft-1', applicationId: 'app-1' } });
      return Promise.resolve({ documents: [] });
    });
  });

  it.each(['cover_letter', 'resume'] as const)(
    'offers no AI generation on the %s form: that lives in the editor now',
    async (type) => {
      await renderForm(type);

      expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/base it on a resume/i)).not.toBeInTheDocument();
    },
  );

  it.each([
    ['cover_letter', 'Cover Letter'],
    ['resume', 'Resume'],
  ] as const)(
    'creates an empty %s without a title, named after its type',
    async (type, defaultTitle) => {
      await renderForm(type);

      fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('CreateDocumentDraft'),
          {
            input: expect.objectContaining({
              type,
              title: defaultTitle,
              plainText: '',
              sourceDocumentId: null,
              contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
            }),
          },
        ),
      );
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith({
          to: '/applications/$applicationId/documents/$draftId',
          params: { applicationId: 'app-1', draftId: 'draft-1' },
        }),
      );
    },
  );

  it('stays on the form and shows the reason when creating fails', async () => {
    mockGqlRequest.mockImplementation((query: string) =>
      query.includes('CreateDocumentDraft')
        ? Promise.reject({
            response: {
              errors: [{ message: 'Draft limit reached', extensions: { code: 'QUOTA_EXCEEDED' } }],
            },
          })
        : Promise.resolve({ documents: [] }),
    );
    await renderForm('resume');

    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    expect(await screen.findByText(/draft limit reached/i)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
