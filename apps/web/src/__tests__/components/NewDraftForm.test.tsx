import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

describe('NewDraftForm — generating a resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue({ documents: [] });
  });

  it('offers generation only on the resume form, not the cover letter one', async () => {
    // Cover letters are generated from their own tab.
    await renderForm('cover_letter');
    expect(screen.queryByRole('button', { name: /generate resume/i })).not.toBeInTheDocument();
  });

  it('offers generation on the resume form', async () => {
    await renderForm('resume');
    expect(screen.getByRole('button', { name: /generate resume/i })).toBeInTheDocument();
  });

  it('says the resume is built only from what the user entered', async () => {
    // The honesty claim is part of the feature, not decoration: users need to
    // know the model is not inventing history for them.
    await renderForm('resume');

    expect(screen.getByText(/nothing is invented/i)).toBeInTheDocument();
    expect(screen.getByText(/work experience, education and skills/i)).toBeInTheDocument();
  });

  it('generates and opens the draft in the editor', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('GenerateResume'))
        return Promise.resolve({ generateResume: { id: 'draft-9', applicationId: 'app-1' } });
      return Promise.resolve({ documents: [] });
    });
    await renderForm('resume');

    fireEvent.click(screen.getByRole('button', { name: /generate resume/i }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/applications/$applicationId/documents/$draftId',
        params: { applicationId: 'app-1', draftId: 'draft-9' },
      }),
    );
  });

  it('shows why generation was refused, and stays put', async () => {
    // A refused resume — the model named an employer the user never entered —
    // must not silently look like nothing happened.
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('GenerateResume'))
        return Promise.reject({
          response: {
            errors: [
              {
                message: 'The AI produced a resume containing experience you have not recorded',
                extensions: { code: 'AI_RESPONSE_INVALID' },
              },
            ],
          },
        });
      return Promise.resolve({ documents: [] });
    });
    await renderForm('resume');

    fireEvent.click(screen.getByRole('button', { name: /generate resume/i }));

    await waitFor(() => expect(screen.getByText(/have not recorded/i)).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('NewDraftForm — generating a cover letter (JEF-396)', () => {
  const upload = (id: string, name: string, documentType: string) => ({
    id,
    applicationId: 'app-1',
    name,
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    url: `https://example.com/${id}`,
    documentType,
    version: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const draft = (id: string, title: string, type: string) => ({
    id,
    applicationId: 'app-1',
    type,
    title,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  const respond = (generate?: () => Promise<unknown>) =>
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('GenerateCoverLetter'))
        return generate
          ? generate()
          : Promise.resolve({ generateCoverLetter: { id: 'draft-new' } });
      if (query.includes('query DocumentDrafts'))
        return Promise.resolve({
          documentDrafts: [
            draft('rd-1', 'My resume draft', 'resume'),
            draft('cd-1', 'An old cover letter', 'cover_letter'),
          ],
        });
      return Promise.resolve({
        documents: [
          upload('f-1', 'resume.pdf', 'resume'),
          upload('f-2', 'portfolio.pdf', 'portfolio'),
          upload('f-3', 'letter.pdf', 'cover_letter'),
        ],
      });
    });

  beforeEach(() => {
    vi.clearAllMocks();
    respond();
  });

  const generateButton = () => screen.getByRole('button', { name: /generate cover letter/i });
  const picker = () => screen.getByLabelText(/base it on a resume/i);

  it('offers generation here, not on the cover letters tab, and not on the resume form', async () => {
    await renderForm('resume');
    expect(
      screen.queryByRole('button', { name: /generate cover letter/i }),
    ).not.toBeInTheDocument();
  });

  it('says it writes from the saved profile', async () => {
    await renderForm('cover_letter');

    expect(screen.getByText(/work experience, education and skills/i)).toBeInTheDocument();
  });

  it('has no paste-your-resume box any more', async () => {
    await renderForm('cover_letter');

    // Only the draft title is a free-text field.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it("offers only this application's resumes — files and drafts, nothing else", async () => {
    await renderForm('cover_letter');

    await waitFor(() => expect(within(picker()).getByText('resume.pdf')).toBeInTheDocument());
    const options = within(picker())
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['None — use my saved profile only', 'resume.pdf', 'My resume draft']);
  });

  it('generates from the profile alone when no resume is chosen, and opens the draft', async () => {
    await renderForm('cover_letter');

    fireEvent.click(generateButton());

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('GenerateCoverLetter'), {
        applicationId: 'app-1',
        resumeDocumentId: null,
        resumeDraftId: null,
      }),
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/applications/$applicationId/documents/$draftId',
        params: { applicationId: 'app-1', draftId: 'draft-new' },
      }),
    );
  });

  it('sends the chosen uploaded resume as a document id', async () => {
    await renderForm('cover_letter');
    await waitFor(() => expect(within(picker()).getByText('resume.pdf')).toBeInTheDocument());

    fireEvent.change(picker(), { target: { value: 'file:f-1' } });
    fireEvent.click(generateButton());

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('GenerateCoverLetter'), {
        applicationId: 'app-1',
        resumeDocumentId: 'f-1',
        resumeDraftId: null,
      }),
    );
  });

  it('sends the chosen resume draft as a draft id', async () => {
    await renderForm('cover_letter');
    await waitFor(() => expect(within(picker()).getByText('My resume draft')).toBeInTheDocument());

    fireEvent.change(picker(), { target: { value: 'draft:rd-1' } });
    fireEvent.click(generateButton());

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('GenerateCoverLetter'), {
        applicationId: 'app-1',
        resumeDocumentId: null,
        resumeDraftId: 'rd-1',
      }),
    );
  });

  it('shows a link to AI settings when the key is not configured, and stays put', async () => {
    respond(() =>
      Promise.reject({ response: { errors: [{ extensions: { code: 'AI_NOT_CONFIGURED' } }] } }),
    );
    await renderForm('cover_letter');

    fireEvent.click(generateButton());

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute(
        'href',
        '/settings/ai',
      ),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate away when generation fails', async () => {
    respond(() => Promise.reject(new Error('rate limited')));
    await renderForm('cover_letter');

    fireEvent.click(generateButton());

    await waitFor(() => expect(screen.getByText(/rate limited/i)).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
