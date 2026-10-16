import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

import { ResumeMatch as ResumeMatchSlot } from '#/routes/_authenticated/applications/$applicationId/-components/ResumeMatchPanel';
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

function renderPanel(resume: React.ComponentProps<typeof ResumeMatchSlot>['resume']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResumeMatchSlot applicationId="app-1" resume={resume}>
        {({ chip, details }) => (
          <div>
            {chip}
            {details}
          </div>
        )}
      </ResumeMatchSlot>
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

const chipName = (name: RegExp | string) => screen.findByRole('button', { name });

describe('ResumeMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers to generate a match when there is none yet', async () => {
    mockApi({});
    renderPanel({ documentDraftId: 'draft-1' });

    expect(await chipName(/generate match/i)).toBeEnabled();
    expect(screen.queryByText(/Good match/)).not.toBeInTheDocument();
  });

  it('shows the saved score as a chip, with no modal, without calling the LLM mutation', async () => {
    mockApi({ matches: [draftMatch] });
    renderPanel({ documentDraftId: 'draft-1' });

    const chip = await chipName(/82 · Good match/);
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Strong overlap on core skills.')).not.toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('mutation ComputeResumeMatchScore'),
      expect.anything(),
    );
  });

  it('opens the summary and keywords in a modal from the chip, and closes it with Escape', async () => {
    mockApi({ matches: [draftMatch] });
    renderPanel({ documentDraftId: 'draft-1' });

    const chip = await chipName(/82 · Good match/);
    fireEvent.click(chip);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Strong overlap on core skills.')).toBeInTheDocument();
    expect(within(dialog).getByText('TypeScript')).toBeInTheDocument();
    expect(within(dialog).getByText('Kubernetes')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /regenerate/i })).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Strong overlap on core skills.')).not.toBeInTheDocument();
  });

  it("ignores another resume's match", async () => {
    mockApi({ matches: [{ ...draftMatch, documentDraftId: 'draft-2' }] });
    renderPanel({ documentDraftId: 'draft-1' });

    expect(await chipName(/generate match/i)).toBeInTheDocument();
    expect(screen.queryByText(/Good match/)).not.toBeInTheDocument();
  });

  it('generates a match for a draft and opens the result', async () => {
    mockApi({ computed: draftMatch });
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(await chipName(/generate match/i));

    expect(await screen.findByText('Strong overlap on core skills.')).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation ComputeResumeMatchScore'),
      { applicationId: 'app-1', documentDraftId: 'draft-1', documentId: null },
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });

  it('generates a match for an uploaded document by its document id', async () => {
    mockApi({ computed: { ...draftMatch, documentDraftId: null, documentId: 'doc-1' } });
    renderPanel({ documentId: 'doc-1' });

    fireEvent.click(await chipName(/generate match/i));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('mutation ComputeResumeMatchScore'),
        { applicationId: 'app-1', documentDraftId: null, documentId: 'doc-1' },
      ),
    );
    expect(await chipName(/82 · Good match/)).toBeInTheDocument();
  });

  describe('when the resume changed since the match', () => {
    it('marks the chip and shows the reminder to regenerate once expanded', async () => {
      mockApi({ matches: [{ ...draftMatch, isStale: true }] });
      renderPanel({ documentDraftId: 'draft-1' });

      const chip = await chipName(/82 · Good match/);
      expect(screen.getByLabelText('Out of date')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      fireEvent.click(chip);
      expect(screen.getByRole('status')).toHaveTextContent(/resume has changed/i);
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
    });

    it('does not mark an up-to-date match', async () => {
      mockApi({ matches: [draftMatch] });
      renderPanel({ documentDraftId: 'draft-1' });

      fireEvent.click(await chipName(/82 · Good match/));
      expect(screen.queryByLabelText('Out of date')).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('clears the reminder after regenerating', async () => {
      mockApi({
        matches: [{ ...draftMatch, isStale: true, score: 40, label: 'Some overlap' }],
        computed: { ...draftMatch, id: 'match-2', score: 90, label: 'Excellent match' },
      });
      renderPanel({ documentDraftId: 'draft-1' });

      fireEvent.click(await chipName(/40 · Some overlap/));
      fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

      expect(await chipName(/90 · Excellent match/)).toBeInTheDocument();
      expect(screen.queryByText(/Some overlap/)).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('shows an error and keeps the button available when generating fails', async () => {
    mockApi({ computeError: new Error('Something broke') });
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(await chipName(/generate match/i));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate match/i })).toBeEnabled();
  });
});
