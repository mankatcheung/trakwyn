import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
};
const ALL_FEATURES = {
  notifications: true,
  analytics: true,
  offers: true,
  shareLinks: true,
  apiAccess: true,
};
const FREE_LIMITS = { applications: 50, documentBytes: 100 * MB, aiActionsPerMonth: 5 };
const PRO_LIMITS = { applications: null, documentBytes: 2048 * MB, aiActionsPerMonth: null };

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
  usage: { applications: 12, documentBytes: 25 * MB, aiActionsThisMonth: 3 },
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
    expect(screen.getByText('3 of 5 used (60%)')).toBeInTheDocument();
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

  it('says when a Pro trial ends and shows no limit for AI', async () => {
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
    expect(screen.getByText('3 used, no limit')).toBeInTheDocument();
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
        usage: { applications: 40, documentBytes: 100 * MB, aiActionsThisMonth: 5 },
      }),
    );
    render(<SettingsPlanPage />, { wrapper: Wrapper });

    expect(await screen.findByText('40 of 50 used (80%)')).toBeInTheDocument();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });
});
