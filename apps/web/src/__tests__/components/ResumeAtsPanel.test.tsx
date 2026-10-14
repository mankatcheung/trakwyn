import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ResumeAts } from '#/routes/_authenticated/applications/$applicationId/-components/ResumeAtsPanel';
import type { AtsScore } from '#/routes/_authenticated/applications/$applicationId/-resumeAtsQueries';

const goodScore: AtsScore = {
  id: 'ats-1',
  applicationId: 'app-1',
  documentDraftId: 'draft-1',
  documentId: null,
  score: 81,
  label: 'Good',
  readable: true,
  generatedAt: '2026-10-14T12:00:00.000Z',
  isStale: false,
  checks: [
    {
      id: 'email',
      label: 'Email address',
      passed: true,
      points: 8,
      maxPoints: 8,
      hint: 'Put your email near the top.',
    },
    {
      id: 'skills_heading',
      label: 'Skills heading',
      passed: false,
      points: 0,
      maxPoints: 9,
      hint: 'Add a heading named “Skills”.',
    },
  ],
};

const unreadable: AtsScore = {
  ...goodScore,
  id: 'ats-2',
  documentDraftId: null,
  documentId: 'doc-1',
  score: 0,
  label: 'Not readable by an ATS',
  readable: false,
  checks: [
    {
      id: 'text_extracted',
      label: 'Text can be extracted',
      passed: false,
      points: 0,
      maxPoints: 0,
      hint: 'Export a text-based PDF.',
    },
  ],
};

function renderPanel(resume: React.ComponentProps<typeof ResumeAts>['resume']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResumeAts applicationId="app-1" resume={resume}>
        {({ chip, details }) => (
          <div>
            {chip}
            {details}
          </div>
        )}
      </ResumeAts>
    </QueryClientProvider>,
  );
}

/** Answers the saved-results list and the check mutation separately. */
function mockApi({
  saved = [],
  computed,
  computeError,
}: {
  saved?: AtsScore[];
  computed?: AtsScore;
  computeError?: unknown;
}) {
  mockGqlRequest.mockImplementation((document: string) => {
    if (document.includes('mutation ComputeResumeAtsScore')) {
      return computeError
        ? Promise.reject(computeError)
        : Promise.resolve({ computeResumeAtsScore: computed });
    }
    return Promise.resolve({ resumeAtsScores: saved });
  });
}

const computeCalls = () =>
  mockGqlRequest.mock.calls.filter(([doc]) =>
    (doc as string).includes('mutation ComputeResumeAtsScore'),
  );

const checkButton = () => screen.findByRole('button', { name: /check ats/i });

describe('ResumeAts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers to check a resume that has no saved result, and runs nothing until asked', async () => {
    mockApi({});
    renderPanel({ documentDraftId: 'draft-1' });

    expect(await checkButton()).toBeEnabled();
    expect(computeCalls()).toHaveLength(0);
  });

  it('shows the saved result on load, as after a page reload, without checking again', async () => {
    mockApi({ saved: [goodScore] });
    renderPanel({ documentDraftId: 'draft-1' });

    expect(await screen.findByRole('button', { name: /ATS 81 · Good/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check ats/i })).not.toBeInTheDocument();
    expect(computeCalls()).toHaveLength(0);
  });

  it("ignores another resume's saved result", async () => {
    mockApi({ saved: [{ ...goodScore, documentDraftId: 'draft-2' }] });
    renderPanel({ documentDraftId: 'draft-1' });

    expect(await checkButton()).toBeInTheDocument();
    expect(screen.queryByText(/ATS 81/)).not.toBeInTheDocument();
  });

  it('checks a draft by its draft id and opens the checklist', async () => {
    mockApi({ computed: goodScore });
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(await checkButton());

    await screen.findByRole('button', { name: /ATS 81 · Good/ });
    expect(await screen.findByText('Fix these first · 1')).toBeInTheDocument();
    expect(computeCalls()[0][1]).toEqual({ documentDraftId: 'draft-1', documentId: null });
  });

  it('checks an uploaded file by its document id', async () => {
    mockApi({ computed: { ...goodScore, documentDraftId: null, documentId: 'doc-1' } });
    renderPanel({ documentId: 'doc-1' });

    fireEvent.click(await checkButton());

    await screen.findByRole('button', { name: /ATS 81/ });
    expect(computeCalls()[0][1]).toEqual({ documentDraftId: null, documentId: 'doc-1' });
  });

  it('opens the saved checklist from the chip, failed checks and their fixes first', async () => {
    mockApi({ saved: [goodScore] });
    renderPanel({ documentDraftId: 'draft-1' });

    const chip = await screen.findByRole('button', { name: /ATS 81/ });
    expect(screen.queryByText('Fix these first · 1')).not.toBeInTheDocument();
    fireEvent.click(chip);

    expect(screen.getByText('Fix these first · 1')).toBeInTheDocument();
    expect(screen.getByText('Add a heading named “Skills”.')).toBeInTheDocument();
    expect(screen.getByText('Passing · 1')).toBeInTheDocument();
    expect(screen.getByText('0 / 9')).toBeInTheDocument();
    expect(screen.getByText(/^Checked /)).toBeInTheDocument();
    // A passing check needs no fix, so its hint stays out of the way.
    expect(screen.queryByText('Put your email near the top.')).not.toBeInTheDocument();
  });

  it('collapses and reopens the checklist from the chip', async () => {
    mockApi({ saved: [goodScore] });
    renderPanel({ documentDraftId: 'draft-1' });
    const chip = await screen.findByRole('button', { name: /ATS 81/ });

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(chip);
    expect(screen.queryByText('Fix these first · 1')).not.toBeInTheDocument();
    expect(chip).toHaveAttribute('aria-expanded', 'false');
  });

  it('says so when the resume changed after it was checked', async () => {
    mockApi({ saved: [{ ...goodScore, isStale: true }] });
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(await screen.findByRole('button', { name: /ATS 81/ }));

    expect(screen.getByRole('status')).toHaveTextContent(/changed since it was checked/i);
    expect(screen.getByLabelText('Out of date')).toBeInTheDocument();
  });

  it('reports a scan as not readable instead of showing a score', async () => {
    mockApi({ computed: unreadable });
    renderPanel({ documentId: 'doc-1' });

    fireEvent.click(await checkButton());

    expect(await screen.findByRole('button', { name: /not readable/i })).toBeInTheDocument();
    expect(screen.getByText(/No text could be extracted/)).toBeInTheDocument();
    expect(screen.getByText('Export a text-based PDF.')).toBeInTheDocument();
    expect(screen.queryByText(/ATS 0/)).not.toBeInTheDocument();
  });

  it('checks again from the open checklist, replacing the saved result', async () => {
    mockApi({ saved: [{ ...goodScore, isStale: true }], computed: { ...goodScore, score: 100 } });
    renderPanel({ documentDraftId: 'draft-1' });
    fireEvent.click(await screen.findByRole('button', { name: /ATS 81/ }));

    fireEvent.click(screen.getByRole('button', { name: /run check again/i }));

    await screen.findByRole('button', { name: /ATS 100/ });
    expect(screen.queryByRole('button', { name: /ATS 81/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(computeCalls()).toHaveLength(1);
  });

  it('shows the error and keeps the check available when it fails', async () => {
    mockApi({
      computeError: {
        response: {
          errors: [{ message: 'Too many requests', extensions: { code: 'RATE_LIMITED' } }],
        },
      },
    });
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(await checkButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    await waitFor(() => expect(screen.getByRole('button', { name: /check ats/i })).toBeEnabled());
  });
});
