import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ResumeMatchPanel } from '#/routes/_authenticated/applications/$applicationId/-components/ResumeMatchPanel';
import type { ResumeMatch } from '#/routes/_authenticated/applications/$applicationId/-resumeMatchQueries';

const draftMatch: ResumeMatch = {
  id: 'match-1',
  applicationId: 'app-1',
  documentDraftId: 'draft-1',
  documentId: null,
  score: 82,
  label: 'Good match',
  matchedKeywords: ['TypeScript', 'GraphQL'],
  missingKeywords: ['Kubernetes'],
  summary: 'Strong overlap on core skills.',
  generatedAt: '2026-10-12T12:00:00.000Z',
  isStale: false,
};

function renderPanel(resume: React.ComponentProps<typeof ResumeMatchPanel>['resume']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResumeMatchPanel applicationId="app-1" resume={resume} />
    </QueryClientProvider>,
  );
}

/** Answers the list query and the compute mutation separately. */
function mockApi({
  matches = [],
  computed,
  computeError,
}: {
  matches?: ResumeMatch[];
  computed?: ResumeMatch;
  computeError?: Error;
}) {
  mockGqlRequest.mockImplementation((document: string) => {
    if (document.includes('mutation ComputeResumeMatchScore')) {
      return computeError
        ? Promise.reject(computeError)
        : Promise.resolve({ computeResumeMatchScore: computed });
    }
    return Promise.resolve({ resumeMatches: matches });
  });
}

describe('ResumeMatchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers to generate a match when there is none yet', async () => {
    mockApi({});
    renderPanel({ documentDraftId: 'draft-1' });

    expect(await screen.findByRole('button', { name: /generate match/i })).toBeEnabled();
    expect(screen.queryByText('Good match')).not.toBeInTheDocument();
  });

  it('shows the saved result without calling the LLM mutation', async () => {
    mockApi({ matches: [draftMatch] });
    renderPanel({ documentDraftId: 'draft-1' });

    expect(await screen.findByText('Good match')).toBeInTheDocument();
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.getByText('Strong overlap on core skills.')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('mutation ComputeResumeMatchScore'),
      expect.anything(),
    );
  });

  it("ignores another resume's match", async () => {
    mockApi({ matches: [{ ...draftMatch, documentDraftId: 'draft-2' }] });
    renderPanel({ documentDraftId: 'draft-1' });

    expect(await screen.findByRole('button', { name: /generate match/i })).toBeInTheDocument();
    expect(screen.queryByText('Good match')).not.toBeInTheDocument();
  });

  it('generates a match for a draft and shows the result', async () => {
    mockApi({ computed: draftMatch });
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(await screen.findByRole('button', { name: /generate match/i }));

    expect(await screen.findByText('Good match')).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation ComputeResumeMatchScore'),
      { applicationId: 'app-1', documentDraftId: 'draft-1', documentId: null },
    );
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });

  it('generates a match for an uploaded document by its document id', async () => {
    mockApi({ computed: { ...draftMatch, documentDraftId: null, documentId: 'doc-1' } });
    renderPanel({ documentId: 'doc-1' });

    fireEvent.click(await screen.findByRole('button', { name: /generate match/i }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('mutation ComputeResumeMatchScore'),
        { applicationId: 'app-1', documentDraftId: null, documentId: 'doc-1' },
      ),
    );
    expect(await screen.findByText('Good match')).toBeInTheDocument();
  });

  describe('when the resume changed since the match', () => {
    it('shows the reminder to regenerate', async () => {
      mockApi({ matches: [{ ...draftMatch, isStale: true }] });
      renderPanel({ documentDraftId: 'draft-1' });

      expect(await screen.findByRole('status')).toHaveTextContent(/resume has changed/i);
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
    });

    it('does not show the reminder for an up-to-date match', async () => {
      mockApi({ matches: [draftMatch] });
      renderPanel({ documentDraftId: 'draft-1' });

      await screen.findByText('Good match');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('clears the reminder after regenerating', async () => {
      mockApi({
        matches: [{ ...draftMatch, isStale: true, score: 40, label: 'Some overlap' }],
        computed: { ...draftMatch, id: 'match-2', score: 90, label: 'Excellent match' },
      });
      renderPanel({ documentDraftId: 'draft-1' });

      fireEvent.click(await screen.findByRole('button', { name: /regenerate/i }));

      expect(await screen.findByText('Excellent match')).toBeInTheDocument();
      expect(screen.queryByText('Some overlap')).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('shows an error and keeps the button available when generating fails', async () => {
    mockApi({ computeError: new Error('Something broke') });
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(await screen.findByRole('button', { name: /generate match/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate match/i })).toBeEnabled();
  });
});
