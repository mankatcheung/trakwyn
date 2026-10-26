import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { SettingsPlanPage } from '#/routes/_authenticated/settings/-components/SettingsPlanPage';
import type { BillingStatus } from '#/lib/billingStatus';

const MB = 1024 * 1024;
const NO_FEATURES = {
  notifications: false,
  analytics: false,
  offers: false,
  shareLinks: false,
  apiAccess: false,
  mcpAccess: true,
};
const ALL_FEATURES = {
  notifications: true,
  analytics: true,
  offers: true,
  shareLinks: true,
  apiAccess: true,
  mcpAccess: true,
};
const FREE_LIMITS = { applications: 50, documentBytes: 100 * MB };
const PRO_LIMITS = { applications: null, documentBytes: 2048 * MB };

const freeStatus = (overrides: Partial<BillingStatus> = {}): BillingStatus => ({
  enforced: true,
  plan: 'free',
  planExpiresAt: null,
  planSource: null,
  features: NO_FEATURES,
  limits: FREE_LIMITS,
  catalogue: {
    free: { features: NO_FEATURES, limits: FREE_LIMITS },
    pro: { features: ALL_FEATURES, limits: PRO_LIMITS },
  },
  usage: { applications: 12, documentBytes: 25 * MB },
  ...overrides,
});

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const serve = (status: BillingStatus) =>
  mockGqlRequest.mockResolvedValue({ billingStatus: status });

describe('SettingsPlanPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows nothing until the status has loaded', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<SettingsPlanPage />, { wrapper: Wrapper });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a Free user their plan and what they have used', async () => {
    serve(freeStatus());
    render(<SettingsPlanPage />, { wrapper: Wrapper });

    expect(await screen.findByText('You are on the Free plan.')).toBeInTheDocument();
    expect(screen.getByText('12 of 50 used (24%)')).toBeInTheDocument();
    expect(screen.getByText('25 MB of 100 MB used (25%)')).toBeInTheDocument();
    // AI runs on the user's own key, so there is no allowance to meter (JEF-442).
    expect(screen.queryByText('AI actions this month')).toBeNull();
  });

  it('compares Free and Pro, row by row', async () => {
    serve(freeStatus());
    render(<SettingsPlanPage />, { wrapper: Wrapper });

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    const analytics = rows.find((row) => within(row).queryByText('Analytics'));
    const applications = rows.find((row) => within(row).queryByText('Applications'));

    expect(within(analytics!).getByText('Not included')).toBeInTheDocument();
    expect(within(analytics!).getByText('Included')).toBeInTheDocument();
    expect(within(applications!).getByText('50')).toBeInTheDocument();
    expect(within(applications!).getByText('Unlimited')).toBeInTheDocument();
  });

  it('shows AI actions as unlimited and MCP as included on both plans (JEF-442)', async () => {
    serve(freeStatus());
    render(<SettingsPlanPage />, { wrapper: Wrapper });

    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    const ai = rows.find((row) => within(row).queryByText('AI actions with your own key'));
    const mcp = rows.find((row) => within(row).queryByText('MCP access'));
    const api = rows.find((row) => within(row).queryByText('API access with a token'));

    expect(within(ai!).getAllByText('Unlimited')).toHaveLength(2);
    expect(within(mcp!).getAllByText('Included')).toHaveLength(2);
    expect(within(api!).getByText('Not included')).toBeInTheDocument();
    expect(within(api!).getByText('Included')).toBeInTheDocument();
  });

  it('says when a Pro trial ends and shows no application limit', async () => {
    serve(
      freeStatus({
        plan: 'pro',
        planSource: 'trial',
        planExpiresAt: '2026-12-01T12:00:00.000Z',
        features: ALL_FEATURES,
        limits: PRO_LIMITS,
      }),
    );
    render(<SettingsPlanPage />, { wrapper: Wrapper });

    expect(await screen.findByText(/Your Pro trial ends on/)).toBeInTheDocument();
    expect(screen.getByText('12 used, no limit')).toBeInTheDocument();
  });

  it('says every feature is included when plans are not enforced', async () => {
    serve(freeStatus({ enforced: false, features: ALL_FEATURES }));
    render(<SettingsPlanPage />, { wrapper: Wrapper });

    expect(
      await screen.findByText('Every feature is included on this server.'),
    ).toBeInTheDocument();
  });

  it('warns when a limit is nearly used and flags it when reached', async () => {
    serve(
      freeStatus({
        usage: { applications: 40, documentBytes: 100 * MB },
      }),
    );
    render(<SettingsPlanPage />, { wrapper: Wrapper });

    expect(await screen.findByText('40 of 50 used (80%)')).toBeInTheDocument();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  describe('buying and managing Pro', () => {
    const assign = vi.fn();

    beforeEach(() => {
      Object.defineProperty(window, 'location', { value: { assign }, configurable: true });
    });

    it('offers the three purchases to a Free user and sends them to checkout', async () => {
      serve(freeStatus());
      mockGqlRequest.mockImplementation(async (query: string) =>
        query.includes('CreateCheckoutSession')
          ? { createCheckoutSession: { url: 'https://pay.example/c' } }
          : { billingStatus: freeStatus() },
      );
      render(<SettingsPlanPage />, { wrapper: Wrapper });

      expect(await screen.findByRole('button', { name: '3-month pass, $29' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '6-month pass, $49' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open billing portal' })).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: '3-month pass, $29' }));

      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/c'));
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('CreateCheckoutSession'),
        { plan: 'pass3Months' },
      );
    });

    it('says prices are in dollars and include VAT in the UK and EU (JEF-431)', async () => {
      serve(freeStatus());
      render(<SettingsPlanPage />, { wrapper: Wrapper });

      expect(
        await screen.findByText(/Prices are in US dollars and include VAT in the UK and EU/),
      ).toBeInTheDocument();
    });

    it('explains the $9 founder price and that it stays $9 (JEF-431)', async () => {
      serve(freeStatus());
      render(<SettingsPlanPage />, { wrapper: Wrapper });

      const note = await screen.findByText(/Founder price/);
      expect(note).toHaveTextContent('$9 a month');
      expect(note).toHaveTextContent('stays $9 for as long as that subscription runs');
    });

    it('does not show the founder note to an active subscriber (JEF-431)', async () => {
      serve(freeStatus({ plan: 'pro', planSource: 'subscription' }));
      render(<SettingsPlanPage />, { wrapper: Wrapper });

      await screen.findByRole('button', { name: 'Open billing portal' });
      expect(screen.queryByText(/Founder price/)).toBeNull();
    });

    it('shows only the portal to an active subscriber', async () => {
      serve(freeStatus({ plan: 'pro', planSource: 'subscription' }));
      render(<SettingsPlanPage />, { wrapper: Wrapper });

      expect(
        await screen.findByRole('button', { name: 'Open billing portal' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Subscribe, $12 a month' })).toBeNull();
    });

    it('warns a pass holder that subscribing replaces the pass', async () => {
      serve(
        freeStatus({ plan: 'pro', planSource: 'pass', planExpiresAt: '2027-01-01T00:00:00.000Z' }),
      );
      render(<SettingsPlanPage />, { wrapper: Wrapper });

      expect(await screen.findByText(/Subscribing replaces your pass/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open billing portal' })).toBeInTheDocument();
    });

    it('says so when checkout cannot start', async () => {
      mockGqlRequest.mockImplementation(async (query: string) => {
        if (query.includes('CreateCheckoutSession')) throw new Error('boom');
        return { billingStatus: freeStatus() };
      });
      render(<SettingsPlanPage />, { wrapper: Wrapper });

      await userEvent.click(await screen.findByRole('button', { name: 'Subscribe, $12 a month' }));

      expect(
        await screen.findByText('We could not start checkout. Please try again.'),
      ).toBeInTheDocument();
      expect(assign).not.toHaveBeenCalled();
    });

    it('shows no purchase buttons when plans are not enforced', async () => {
      serve(freeStatus({ enforced: false }));
      render(<SettingsPlanPage />, { wrapper: Wrapper });

      await screen.findByText('Every feature is included on this server.');
      expect(screen.queryByRole('button', { name: 'Subscribe, $12 a month' })).toBeNull();
    });
  });
});
