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
  score: 81,
  label: 'Good',
  readable: true,
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
      <ResumeAts resume={resume}>
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

const mockResult = (result: AtsScore) =>
  mockGqlRequest.mockResolvedValue({ computeResumeAtsScore: result });

describe('ResumeAts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers to check a resume and runs nothing until asked', () => {
    renderPanel({ documentDraftId: 'draft-1' });

    expect(screen.getByRole('button', { name: /check ats/i })).toBeEnabled();
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('scores a draft by its draft id, with no document id', async () => {
    mockResult(goodScore);
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(screen.getByRole('button', { name: /check ats/i }));

    await screen.findByRole('button', { name: /ATS 81 · Good/ });
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation ComputeResumeAtsScore'),
      { documentDraftId: 'draft-1', documentId: null },
    );
  });

  it('scores an uploaded file by its document id, with no draft id', async () => {
    mockResult(goodScore);
    renderPanel({ documentId: 'doc-1' });

    fireEvent.click(screen.getByRole('button', { name: /check ats/i }));

    await screen.findByRole('button', { name: /ATS 81/ });
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      documentDraftId: null,
      documentId: 'doc-1',
    });
  });

  it('opens the checklist with failed checks and their fixes first', async () => {
    mockResult(goodScore);
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(screen.getByRole('button', { name: /check ats/i }));

    expect(await screen.findByText('Fix these first · 1')).toBeInTheDocument();
    expect(screen.getByText('Add a heading named “Skills”.')).toBeInTheDocument();
    expect(screen.getByText('Passing · 1')).toBeInTheDocument();
    expect(screen.getByText('0 / 9')).toBeInTheDocument();
    // A passing check needs no fix, so its hint stays out of the way.
    expect(screen.queryByText('Put your email near the top.')).not.toBeInTheDocument();
  });

  it('collapses and reopens the checklist from the chip', async () => {
    mockResult(goodScore);
    renderPanel({ documentDraftId: 'draft-1' });
    fireEvent.click(screen.getByRole('button', { name: /check ats/i }));
    const chip = await screen.findByRole('button', { name: /ATS 81/ });

    fireEvent.click(chip);
    expect(screen.queryByText('Fix these first · 1')).not.toBeInTheDocument();
    expect(chip).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(chip);
    expect(screen.getByText('Fix these first · 1')).toBeInTheDocument();
  });

  it('reports a scan as not readable instead of showing a score', async () => {
    mockResult(unreadable);
    renderPanel({ documentId: 'doc-1' });

    fireEvent.click(screen.getByRole('button', { name: /check ats/i }));

    expect(await screen.findByRole('button', { name: /not readable/i })).toBeInTheDocument();
    expect(screen.getByText(/No text could be extracted/)).toBeInTheDocument();
    expect(screen.getByText('Export a text-based PDF.')).toBeInTheDocument();
    expect(screen.queryByText(/ATS 0/)).not.toBeInTheDocument();
  });

  it('runs the check again from the open checklist', async () => {
    mockResult(goodScore);
    renderPanel({ documentDraftId: 'draft-1' });
    fireEvent.click(screen.getByRole('button', { name: /check ats/i }));
    await screen.findByText('Fix these first · 1');

    mockResult({
      ...goodScore,
      score: 100,
      checks: goodScore.checks.map((c) => ({ ...c, passed: true })),
    });
    fireEvent.click(screen.getByRole('button', { name: /run check again/i }));

    await screen.findByRole('button', { name: /ATS 100/ });
    expect(mockGqlRequest).toHaveBeenCalledTimes(2);
  });

  it('shows the error and keeps the check available when it fails', async () => {
    mockGqlRequest.mockRejectedValue({
      response: {
        errors: [{ message: 'Too many requests', extensions: { code: 'RATE_LIMITED' } }],
      },
    });
    renderPanel({ documentDraftId: 'draft-1' });

    fireEvent.click(screen.getByRole('button', { name: /check ats/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    await waitFor(() => expect(screen.getByRole('button', { name: /check ats/i })).toBeEnabled());
  });
});
