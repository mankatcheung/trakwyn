import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockNavigate, mockGqlRequest, mockInvalidate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
  mockInvalidate: vi.fn(),
}));

// The quota hint is covered by QuotaHint.test.tsx; here it would add a request of its own.
vi.mock('#/lib/contentQuota', () => ({ useQuotaState: () => null }));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useParams: () => ({ applicationId: 'app-test-id' }),
  }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/queryClient', () => ({
  queryClient: { invalidateQueries: mockInvalidate },
}));

import { EditApplicationPage } from '#/routes/_authenticated/applications/$applicationId/-components/EditApplicationPage';

vi.mock('#/components/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({
    onTrakwynAi: false,
    needsSetup: false,
    view: null,
    costOf: () => null,
    canAfford: () => true,
    refresh: () => Promise.resolve(),
  }),
}));

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
  jobUrl: '',
  location: 'Remote',
  salaryRange: '$150k',
  description: 'Great role',
  appliedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('EditApplicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton before data is available', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    render(<EditApplicationPage />, { wrapper: Wrapper });
    expect(screen.queryByText('Edit application')).not.toBeInTheDocument();
  });

  it('renders pre-populated form fields after load', async () => {
    mockGqlRequest.mockResolvedValue({ application: mockApp });
    render(<EditApplicationPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Stripe')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Software Engineer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Remote')).toBeInTheDocument();
    expect(screen.getByDisplayValue('$150k')).toBeInTheDocument();
  });

  it('renders the heading and save button', async () => {
    mockGqlRequest.mockResolvedValue({ application: mockApp });
    render(<EditApplicationPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Edit application')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('shows validation error when company is cleared', async () => {
    mockGqlRequest.mockResolvedValue({ application: mockApp });
    render(<EditApplicationPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Stripe')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('Stripe'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Company is required')).toBeInTheDocument();
    });
    expect(mockGqlRequest).toHaveBeenCalledTimes(1); // only the initial fetch
  });

  it('submits the form with updated values', async () => {
    mockGqlRequest
      .mockResolvedValueOnce({ application: mockApp })
      .mockResolvedValueOnce({ updateApplication: { id: 'app-test-id' } });

    render(<EditApplicationPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Stripe')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('Stripe'), { target: { value: 'Acme Corp' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('UpdateApplication'),
        expect.objectContaining({
          id: 'app-test-id',
          input: expect.objectContaining({ company: 'Acme Corp' }),
        }),
      );
    });
  });

  it('invalidates queries and navigates on successful submit', async () => {
    mockGqlRequest
      .mockResolvedValueOnce({ application: mockApp })
      .mockResolvedValueOnce({ updateApplication: { id: 'app-test-id' } });

    render(<EditApplicationPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Stripe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/applications/$applicationId' }),
      );
    });
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('handles app with null optional fields and valid jobUrl', async () => {
    const sparseApp = {
      ...mockApp,
      jobUrl: 'https://stripe.com/jobs/1',
      location: null,
      salaryRange: null,
      description: null,
    };
    mockGqlRequest
      .mockResolvedValueOnce({ application: sparseApp })
      .mockResolvedValueOnce({ updateApplication: { id: 'app-test-id' } });

    render(<EditApplicationPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Stripe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('UpdateApplication'),
        expect.objectContaining({
          input: expect.objectContaining({ jobUrl: 'https://stripe.com/jobs/1' }),
        }),
      );
    });
  });

  it('shows error message on API failure', async () => {
    mockGqlRequest
      .mockResolvedValueOnce({ application: mockApp })
      .mockRejectedValueOnce(new Error('network error'));

    render(<EditApplicationPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Stripe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
