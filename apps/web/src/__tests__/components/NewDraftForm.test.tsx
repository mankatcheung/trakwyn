import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const { mockGqlRequest, mockNavigate } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import {
  NewDraftForm,
  type DraftType,
} from '#/routes/_authenticated/applications/$applicationId/-components/NewDraftForm';

const renderForm = async (type: DraftType) => {
  render(<NewDraftForm applicationId="app-1" type={type} />);
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
