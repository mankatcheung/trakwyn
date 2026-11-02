import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

// The quota hint is covered by QuotaHint.test.tsx; here it would need a query client of its own.
vi.mock('#/lib/contentQuota', () => ({ useQuotaState: () => null }));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({
    ...opts,
    useParams: () => ({ applicationId: 'app-1' }),
  }),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { Route } from '#/routes/_authenticated/applications/$applicationId/offers/index';

const OffersPage = (Route as unknown as { component: ComponentType }).component;

const offer = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'offer-1',
  applicationId: 'app-1',
  baseSalary: 150000,
  bonus: 10000,
  equity: '1000 RSUs',
  benefits: 'Health, 401k',
  costOfLivingAdjustment: null,
  currency: 'USD',
  period: 'yearly',
  notes: 'Great offer',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const cardFor = (text: string) =>
  screen.getByText(text).closest('div[class*="bg-white"]') as HTMLElement;

describe('OffersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when there are no offers', async () => {
    mockGqlRequest.mockResolvedValue({ offers: [] });
    render(<OffersPage />);

    await waitFor(() => {
      expect(screen.getByText(/no offers yet/i)).toBeInTheDocument();
    });
  });

  it('renders an offer with formatted salary, bonus, equity, benefits, and notes', async () => {
    mockGqlRequest.mockResolvedValue({ offers: [offer()] });
    render(<OffersPage />);

    await waitFor(() => {
      expect(screen.getByText('$150,000/yr')).toBeInTheDocument();
    });
    expect(screen.getByText('+ $10,000/yr bonus')).toBeInTheDocument();
    expect(screen.getByText('Equity: 1000 RSUs')).toBeInTheDocument();
    expect(screen.getByText('Benefits: Health, 401k')).toBeInTheDocument();
    expect(screen.getByText('Great offer')).toBeInTheDocument();
  });

  it('creates a new offer and refetches the list', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('query Offers')) return Promise.resolve({ offers: [] });
      if (query.includes('CreateOffer')) return Promise.resolve({ createOffer: { id: 'offer-2' } });
      return Promise.resolve({});
    });
    render(<OffersPage />);

    await waitFor(() => {
      expect(screen.getByText(/no offers yet/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /add offer/i }));

    const salaryLabel = screen.getByText('Base Salary *');
    const salaryInput = salaryLabel.parentElement?.querySelector('input') as HTMLInputElement;
    fireEvent.change(salaryInput, { target: { value: '120000' } });

    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('query Offers'))
        return Promise.resolve({ offers: [offer({ id: 'offer-2', baseSalary: 120000 })] });
      return Promise.resolve({ createOffer: { id: 'offer-2' } });
    });

    fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('CreateOffer'),
        expect.objectContaining({
          input: expect.objectContaining({ applicationId: 'app-1', baseSalary: 120000 }),
        }),
      );
    });
  });

  it('opens the edit form pre-filled when the edit icon is clicked', async () => {
    mockGqlRequest.mockResolvedValue({ offers: [offer()] });
    render(<OffersPage />);

    await waitFor(() => {
      expect(screen.getByText('$150,000/yr')).toBeInTheDocument();
    });

    const card = cardFor('$150,000/yr');
    const buttons = within(card).getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(screen.getByText('Edit Offer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1000 RSUs')).toBeInTheDocument();
  });

  it('deletes an offer after confirming', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('query Offers')) return Promise.resolve({ offers: [offer()] });
      if (query.includes('DeleteOffer')) return Promise.resolve({ deleteOffer: true });
      return Promise.resolve({});
    });
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );

    render(<OffersPage />);
    await waitFor(() => {
      expect(screen.getByText('$150,000/yr')).toBeInTheDocument();
    });

    const card = cardFor('$150,000/yr');
    const buttons = within(card).getAllByRole('button');
    fireEvent.click(buttons[1]);

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('DeleteOffer'), {
        id: 'offer-1',
      });
    });

    vi.unstubAllGlobals();
  });

  it('does not delete when the confirmation is dismissed', async () => {
    mockGqlRequest.mockResolvedValue({ offers: [offer()] });
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );

    render(<OffersPage />);
    await waitFor(() => {
      expect(screen.getByText('$150,000/yr')).toBeInTheDocument();
    });

    const card = cardFor('$150,000/yr');
    const buttons = within(card).getAllByRole('button');
    fireEvent.click(buttons[1]);

    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('DeleteOffer'),
      expect.anything(),
    );

    vi.unstubAllGlobals();
  });
});
