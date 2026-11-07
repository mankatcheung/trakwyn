import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import en from '#/i18n/en.json';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
    onClick,
  }: {
    children: ReactNode;
    to: string;
    className?: string;
    onClick?: () => void;
  }) => (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }));
vi.mock('#/lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/analytics/analytics')>()),
  captureEvent: mockCapture,
}));

const isLoggedIn = vi.fn(() => false);
vi.mock('#/lib/useIsLoggedIn', () => ({ useIsLoggedIn: () => isLoggedIn() }));
vi.mock('#/graphql/client', () => ({ hasSessionCookie: () => false }));
vi.mock('#/lib/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));

vi.mock('#/lib/i18n', () => ({
  LOCALE_OPTIONS: [{ value: 'en', label: 'English' }],
  useLocale: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    t: (key: string, options?: Record<string, string | number>) =>
      ((en as Record<string, string>)[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? ''),
      ),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat('en', options).format(value),
  }),
}));

import {
  derivePassPricing,
  OPTIONS,
  PricingPage,
  priceAmount,
} from '#/routes/-components/PricingPage';

const API_CONSTANTS = readFileSync(
  join(import.meta.dirname, '..', '..', '..', '..', 'api', 'src', 'use-cases', 'constants.ts'),
  'utf8',
);

describe('PricingPage', () => {
  beforeEach(() => {
    isLoggedIn.mockReturnValue(false);
    mockCapture.mockClear();
  });

  it('reports a pricing view once on mount', () => {
    render(<PricingPage />);
    expect(mockCapture.mock.calls).toEqual([['pricing_viewed']]);
  });

  it('reports the Free and Pro CTAs separately', async () => {
    const user = userEvent.setup();
    render(<PricingPage />);
    mockCapture.mockClear();

    await user.click(screen.getByRole('link', { name: 'Start for free' }));
    await user.click(screen.getByRole('link', { name: 'Get Pro' }));

    expect(mockCapture.mock.calls).toEqual([
      ['marketing_cta_clicked', { cta: 'start_free', location: 'pricing_free' }],
      ['marketing_cta_clicked', { cta: 'get_pro', location: 'pricing_pro' }],
    ]);
  });

  it('renders the three ways to pay for Pro', () => {
    render(<PricingPage />);

    expect(screen.getByText('Monthly subscription')).toBeInTheDocument();
    expect(screen.getByText('3-month pass')).toBeInTheDocument();
    expect(screen.getByText('6-month pass')).toBeInTheDocument();
    expect(screen.getAllByText('$12').length).toBeGreaterThan(0);
    expect(screen.getByText('$29')).toBeInTheDocument();
    expect(screen.getByText('$49')).toBeInTheDocument();
  });

  describe('outcome, best value and savings (JEF-521)', () => {
    const strings = en as Record<string, string>;
    const price = (key: string) => priceAmount(strings[key]);

    it('leads the Pro card with an outcome rather than a list of specs', () => {
      render(<PricingPage />);
      expect(
        screen.getByText('Never hit a limit mid-search. Every tool, unlimited applications.'),
      ).toBeInTheDocument();
    });

    it('frames Free as for getting started and Pro as for an active search (JEF-523)', () => {
      render(<PricingPage />);
      expect(screen.getByText('For getting started')).toBeInTheDocument();
      expect(screen.getByText('For an active search')).toBeInTheDocument();
    });

    it('badges exactly one option as best value, the 6-month pass', () => {
      render(<PricingPage />);
      expect(OPTIONS.filter((o) => o.featured)).toHaveLength(1);
      const badges = screen.getAllByTestId('best-value-badge');
      expect(badges).toHaveLength(1);
      expect(badges[0]).toHaveTextContent('Best value');
      expect(badges[0].closest('li')).toHaveTextContent('6-month pass');
    });

    it('shows each pass its monthly equivalent and saving, derived from the price keys', () => {
      render(<PricingPage />);
      const monthly = price('pricing.monthlyPrice');
      for (const option of OPTIONS.filter((o) => o.months > 1)) {
        const { perMonth, savePercent } = derivePassPricing(
          price(option.priceKey),
          option.months,
          monthly,
        );
        const card = screen.getByText(strings[option.nameKey]).closest('li')!;
        expect(card).toHaveTextContent(`$${perMonth.toFixed(2)} a month`);
        expect(card).toHaveTextContent(`Save ${savePercent}%`);
        expect(savePercent).toBeGreaterThan(0);
      }
    });

    it('works out to $9.67 / 19% for 3 months and $8.17 / 32% for 6 at the current prices', () => {
      expect(derivePassPricing(29, 3, 12).savePercent).toBe(19);
      expect(derivePassPricing(49, 6, 12).savePercent).toBe(32);
      render(<PricingPage />);
      expect(screen.getByText(/\$9\.67 a month/)).toBeInTheDocument();
      expect(screen.getByText(/\$8\.17 a month/)).toBeInTheDocument();
    });

    it('does not show a saving on the monthly option', () => {
      render(<PricingPage />);
      const card = screen.getByText('Monthly subscription').closest('li')!;
      expect(card).not.toHaveTextContent('Save');
    });
  });

  it('states the tax and refund terms', () => {
    render(<PricingPage />);

    expect(screen.getByText(/include VAT|includes VAT/)).toBeInTheDocument();
    expect(screen.getByText(/full refund/)).toBeInTheDocument();
  });

  it('never mentions the founder price', () => {
    const { container } = render(<PricingPage />);

    expect(container.textContent).not.toMatch(/founder/i);
    // A standalone $9 (the founder price), not the $9.67 a month a pass works out to.
    expect(container.textContent).not.toMatch(/\$9(?![\d.])/);
  });

  it('sends signed-out visitors to register and signed-in users to the plan settings', () => {
    const { unmount } = render(<PricingPage />);
    expect(screen.getByRole('link', { name: 'Get Pro' })).toHaveAttribute('href', '/register');
    unmount();

    isLoggedIn.mockReturnValue(true);
    render(<PricingPage />);
    expect(screen.getByRole('link', { name: 'Get Pro' })).toHaveAttribute('href', '/settings/plan');
  });

  it('compares Free and Pro row by row', () => {
    render(<PricingPage />);

    const row = screen.getByRole('row', { name: /Applications/ });
    expect(within(row).getByText('50')).toBeInTheDocument();
    expect(within(row).getByText('Unlimited')).toBeInTheDocument();
    const analytics = screen.getByRole('row', { name: /Analytics/ });
    expect(within(analytics).getByText('Not included')).toBeInTheDocument();
    expect(within(analytics).getByText('Included')).toBeInTheDocument();
  });

  it('shows MCP access as included on both plans', () => {
    render(<PricingPage />);

    const mcp = within(screen.getByRole('row', { name: /MCP access/ }));
    expect(mcp.getAllByText('Included')).toHaveLength(2);
    expect(mcp.queryByText('Not included')).not.toBeInTheDocument();
  });

  describe('against the API plan constants', () => {
    it('shows the Free application cap', () => {
      expect(API_CONSTANTS).toMatch(/APPLICATIONS_PER_USER: 50,/);
      expect(en['pricing.freeApplications']).toBe('50');
    });

    it('shows the Free and Pro storage', () => {
      expect(API_CONSTANTS).toMatch(/DOCUMENT_STORAGE_LIMIT_BYTES: 100 \* 1024 \* 1024,/);
      expect(API_CONSTANTS).toMatch(/documentBytes: 2 \* 1024 \* 1024 \* 1024,/);
      expect(en['pricing.freeStorage']).toBe('100 MB');
      expect(en['pricing.proStorage']).toBe('2 GB');
    });

    it('limits neither plan on AI actions, which run on the user’s own key', () => {
      expect(API_CONSTANTS).not.toMatch(/aiActionsPerMonth/);
      const { container } = render(<PricingPage />);
      const row = within(screen.getByRole('row', { name: /AI actions/ }));
      expect(row.getAllByText('Unlimited')).toHaveLength(2);
      expect(container.textContent).not.toMatch(/AI actions.*a month/);
    });

    it('shows hosted AI as Pro-only: no credits on Free, 300 on Pro (JEF-451)', () => {
      expect(API_CONSTANTS).toMatch(/aiCreditsPerMonth: 0,/);
      expect(API_CONSTANTS).toMatch(/aiCreditsPerMonth: 300,/);
      expect(en['pricing.proAiCredits']).toBe('300 AI credits/month, fair use');
      render(<PricingPage />);
      const row = within(screen.getByRole('row', { name: /Trakwyn AI credits/ }));
      expect(row.getByText('Not included')).toBeInTheDocument();
      expect(row.getByText('300 AI credits/month, fair use')).toBeInTheDocument();
    });

    it('lists exactly the features the API gates, with MCP the only one on Free', () => {
      const free = /PLAN_FEATURES = \{\s*free: \{([^}]*)\}/.exec(API_CONSTANTS)?.[1] ?? '';
      expect(free.match(/: false/g)).toHaveLength(5);
      expect(free.match(/(\w+): true/g)).toEqual(['mcpAccess: true']);
    });
  });
});
