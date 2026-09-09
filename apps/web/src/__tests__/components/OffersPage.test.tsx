import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { OffersPage } from '#/routes/_authenticated/-offers-page';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const offerA = {
  company: 'Acme',
  role: 'Engineer',
  offer: {
    id: 'offer-a',
    applicationId: 'app-a',
    baseSalary: 150000,
    bonus: 10000,
    equity: '1000 RSUs',
    benefits: 'Health, 401k',
    costOfLivingAdjustment: null,
    currency: 'USD',
    period: 'yearly',
    notes: null,
  },
};

const offerB = {
  company: 'Globex',
  role: 'Staff Engineer',
  offer: {
    id: 'offer-b',
    applicationId: 'app-b',
    baseSalary: 140000,
    bonus: null,
    equity: null,
    benefits: null,
    costOfLivingAdjustment: null,
    currency: 'USD',
    period: 'yearly',
    notes: null,
  },
};

describe('OffersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when the user has no offers across any application', async () => {
    mockGqlRequest.mockResolvedValue({ myOffers: [] });
    render(<OffersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/no offers to compare/i)).toBeInTheDocument();
    });
  });

  it('lists offers from every application with company and role shown', async () => {
    mockGqlRequest.mockResolvedValue({ myOffers: [offerA, offerB] });
    render(<OffersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('$150,000/yearly')).toBeInTheDocument();
    });
    expect(screen.getByText(/Acme.*Engineer/)).toBeInTheDocument();
    expect(screen.getByText(/Globex.*Staff Engineer/)).toBeInTheDocument();
  });

  it('disables the compare button until at least 2 offers are selected, and select all selects every offer', async () => {
    mockGqlRequest.mockResolvedValue({ myOffers: [offerA, offerB] });
    render(<OffersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('$150,000/yearly')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /compare \(0\)/i })).toBeDisabled();

    fireEvent.click(screen.getByText(/select all/i));
    expect(screen.getByRole('button', { name: /compare \(2\)/i })).not.toBeDisabled();
  });

  it('renders a comparison table with the best offer highlighted first', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('MyOffers')) return Promise.resolve({ myOffers: [offerA, offerB] });
      if (query.includes('CompareOffers')) {
        return Promise.resolve({
          compareOffers: [
            {
              offer: offerA.offer,
              company: 'Acme',
              role: 'Engineer',
              normalizedYearlySalary: 150000,
              totalCompensation: 160000,
            },
            {
              offer: offerB.offer,
              company: 'Globex',
              role: 'Staff Engineer',
              normalizedYearlySalary: 140000,
              totalCompensation: 140000,
            },
          ],
        });
      }
      return Promise.resolve({});
    });
    render(<OffersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('$150,000/yearly')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/select all/i));
    fireEvent.click(screen.getByRole('button', { name: /compare \(2\)/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('CompareOffers'), {
        offerIds: ['offer-a', 'offer-b'],
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Best')).toBeInTheDocument();
    });
  });
});
