import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockUseSearch } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockUseSearch: vi.fn().mockReturnValue({ token: 'valid-token' }),
}));

vi.mock('@tanstack/react-router', () => ({
  useSearch: mockUseSearch,
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { SharedSummaryPage } from '#/features/share/pages/SharedSummaryPage';
import { gqlContaining } from '#/__tests__/helpers/gqlText';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPage() {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <SharedSummaryPage />
    </QueryClientProvider>,
  );
}

const summary = {
  statusCounts: [
    { status: 'applied', count: 3 },
    { status: 'interviewing', count: 1 },
  ],
  totalApplications: 4,
  totalInterviews: 2,
  upcomingInterviews: 1,
  applicationsUpdatedLast7Days: 2,
  generatedAt: '2024-06-15T12:00:00.000Z',
};

describe('SharedSummaryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({ token: 'valid-token' });
  });

  it('shows a missing-token message when there is no token, without querying', () => {
    mockUseSearch.mockReturnValue({});
    renderPage();

    expect(screen.getByText(/this link is missing a token/i)).toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('queries sharedSummary with the token and renders the headline numbers and status breakdown', async () => {
    mockGqlRequest.mockResolvedValue({ sharedSummary: summary });
    renderPage();

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('SharedSummary'), {
        token: 'valid-token',
      });
    });

    expect(await screen.findByText('4')).toBeInTheDocument(); // totalApplications
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Interviewing')).toBeInTheDocument();
  });

  it('shows an invalid-or-revoked message when the query returns null', async () => {
    mockGqlRequest.mockResolvedValue({ sharedSummary: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/invalid or has been revoked/i)).toBeInTheDocument();
    });
  });

  it('never renders company, role, or other per-application fields', async () => {
    mockGqlRequest.mockResolvedValue({ sharedSummary: summary });
    const { container } = renderPage();

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalled();
    });

    expect(container.textContent).not.toMatch(/company|salary|notes/i);
  });
});
