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

import { LockedFeaturePreview } from '#/components/LockedFeaturePreview';
import { AnalyticsPage } from '#/routes/_authenticated/-analytics-page';
import { OffersPage } from '#/routes/_authenticated/-offers-page';

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
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('BillingStatus')) {
      return Promise.resolve({ billingStatus: { enforced: true, features: features(locked) } });
    }
    if (query.includes('offerAnalytics')) {
      return locked
        ? Promise.reject({
            response: { errors: [{ message: 'x', extensions: { code: 'PLAN_REQUIRED' } }] },
          })
        : Promise.resolve({ offerAnalytics: { byCurrency: [], trend: [] } });
    }
    if (query.includes('myOffers')) {
      return locked
        ? Promise.reject({
            response: { errors: [{ message: 'x', extensions: { code: 'PLAN_REQUIRED' } }] },
          })
        : Promise.resolve({ myOffers: [] });
    }
    if (query.includes('applications')) return Promise.resolve({ applications: [] });
    return Promise.resolve({});
  });
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

  it('shows a Free user the preview instead of the Pro panels', async () => {
    serve(true);
    render(<AnalyticsPage />, { wrapper: Wrapper });

    expect(await screen.findByTestId('locked-feature-preview')).toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('offerAnalytics'),
      expect.anything(),
    );
  });

  it('never shows a Pro user the preview', async () => {
    serve(false);
    render(<AnalyticsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument());
    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(7));
    expect(screen.queryByTestId('locked-feature-preview')).not.toBeInTheDocument();
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
    mockGqlRequest.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('BillingStatus')
          ? { billingStatus: { enforced: false, features: features(false) } }
          : { myOffers: [] },
      ),
    );
    render(<OffersPage />, { wrapper: Wrapper });

    expect(await screen.findByText(/no offers to compare/i)).toBeInTheDocument();
    expect(screen.queryByTestId('locked-feature-preview')).not.toBeInTheDocument();
  });
});
