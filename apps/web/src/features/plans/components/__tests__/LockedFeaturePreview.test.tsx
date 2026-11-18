import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { mockGqlRequest, mockCaptureEvent } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockCaptureEvent: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/analytics/analytics')>()),
  captureEvent: mockCaptureEvent,
}));

import { LockedFeaturePreview } from '#/features/plans/components/LockedFeaturePreview';
import { AnalyticsPage } from '#/features/analytics/pages/AnalyticsPage';
import { OffersPage } from '#/features/offers/pages/OffersPage';
import { gqlText } from '#/__tests__/helpers/gqlText';
import { mockGql, respond, respondError } from '#/__tests__/helpers/gqlMock';
import { BILLING_STATUS_QUERY } from '#/features/plans/lib/billingStatus';
import { OFFER_ANALYTICS_QUERY } from '#/features/analytics/graphql/offerAnalyticsQueries';
import { MY_OFFERS_QUERY } from '#/features/offers/graphql/offersQueries';
import { ANALYTICS_QUERY } from '#/features/analytics/graphql/analyticsQueries';

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const features = (locked: boolean) => ({
  notifications: !locked,
  analytics: !locked,
  offers: !locked,
  shareLinks: !locked,
  apiAccess: !locked,
  mcpAccess: true,
});

/** Answers each query by name; `locked` is what the API says about the plan's features. */
function serve(locked: boolean) {
  const planRequired = {
    response: { errors: [{ message: 'x', extensions: { code: 'PLAN_REQUIRED' } }] },
  };
  mockGql(mockGqlRequest, [
    respond(BILLING_STATUS_QUERY, {
      billingStatus: { enforced: true, features: features(locked) },
    }),
    locked
      ? respondError(OFFER_ANALYTICS_QUERY, planRequired)
      : respond(OFFER_ANALYTICS_QUERY, { offerAnalytics: { byCurrency: [], trend: [] } }),
    locked
      ? respondError(MY_OFFERS_QUERY, planRequired)
      : respond(MY_OFFERS_QUERY, { myOffers: [] }),
    respond(ANALYTICS_QUERY, { applications: [] }),
  ]);
}

describe('LockedFeaturePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says the feature is on Pro and links to the plan page', () => {
    render(<LockedFeaturePreview feature="analytics" />, { wrapper: Wrapper });

    expect(screen.getByText('Available on Pro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what Pro includes' })).toHaveAttribute(
      'href',
      '/settings/plan',
    );
  });

  it('hides the blurred sample from assistive technology', () => {
    render(<LockedFeaturePreview feature="offers" />, { wrapper: Wrapper });

    const preview = screen.getByTestId('locked-feature-preview');
    expect(preview.querySelector('[aria-hidden="true"].blur-sm')).not.toBeNull();
  });

  it('reports the click with its source and feature', () => {
    render(<LockedFeaturePreview feature="offers" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('link', { name: 'See what Pro includes' }));

    expect(mockCaptureEvent).toHaveBeenCalledWith('upgrade_clicked', {
      source: 'locked_preview',
      feature: 'offers',
    });
  });
});

describe('AnalyticsPage plan gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('covers the whole page for a Free user, with a blurred inert sample and no real panels', async () => {
    serve(true);
    render(<AnalyticsPage />, { wrapper: Wrapper });

    const overlay = await screen.findByTestId('locked-feature-overlay');
    const sample = overlay.querySelector('[aria-hidden="true"]');
    expect(sample).toHaveAttribute('inert');
    expect(sample).toHaveClass('blur-md');
    expect(screen.getByText('Available on Pro')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument();

    // Nothing of the real page sits beside the lock: no real panels, no gated or per-panel requests.
    expect(screen.queryByText('Interview round outcomes')).not.toBeInTheDocument();
    expect(screen.queryByText('Time to respond')).not.toBeInTheDocument();
    expect(mockGqlRequest.mock.calls.some(([doc]) => gqlText(doc).includes('offerAnalytics'))).toBe(
      false,
    );
  });

  it('never shows a Pro user the overlay', async () => {
    serve(false);
    render(<AnalyticsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument());
    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(7));
    expect(screen.queryByTestId('locked-feature-overlay')).not.toBeInTheDocument();
  });
});

describe('OffersPage plan gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a Free user the preview and no error', async () => {
    serve(true);
    render(<OffersPage />, { wrapper: Wrapper });

    expect(await screen.findByTestId('locked-feature-preview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('never shows a Pro user the preview', async () => {
    serve(false);
    render(<OffersPage />, { wrapper: Wrapper });

    expect(await screen.findByText(/no offers to compare/i)).toBeInTheDocument();
    expect(screen.queryByTestId('locked-feature-preview')).not.toBeInTheDocument();
  });

  it('shows no preview where plans are not enforced', async () => {
    mockGql(mockGqlRequest, [
      respond(BILLING_STATUS_QUERY, {
        billingStatus: { enforced: false, features: features(false) },
      }),
      respond(MY_OFFERS_QUERY, { myOffers: [] }),
    ]);
    render(<OffersPage />, { wrapper: Wrapper });

    expect(await screen.findByText(/no offers to compare/i)).toBeInTheDocument();
    expect(screen.queryByTestId('locked-feature-preview')).not.toBeInTheDocument();
  });
});
