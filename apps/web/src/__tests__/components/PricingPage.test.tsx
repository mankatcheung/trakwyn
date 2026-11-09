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

    // The header carries the same label (JEF-518); the Free card's CTA comes last.
    await user.click(screen.getAllByRole('link', { name: 'Start for free' }).at(-1)!);
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

    it('leads the options with the no-renewal benefit', () => {
      render(<PricingPage />);
      expect(
        screen.getByRole('heading', { name: 'Pro for the length of your search' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Pick a pass that ends on its own: no renewal, nothing to cancel when you're hired.",
        ),
      ).toBeInTheDocument();
    });

    it('marks each pass, and only the passes, as not auto-renewing', () => {
      render(<PricingPage />);
      const chips = screen.getAllByTestId('no-auto-renew-chip');
      expect(chips).toHaveLength(2);
      expect(chips.map((c) => c.closest('li'))).toEqual([
        screen.getByText('3-month pass').closest('li'),
        screen.getByText('6-month pass').closest('li'),
      ]);
      for (const chip of chips) expect(chip).toHaveTextContent('No auto-renew');
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
    // The policy text is also the answer to the FAQ's refund question.
    expect(screen.getAllByText(/full refund/).length).toBeGreaterThan(0);
  });

  it('puts the short guarantee directly under the Get Pro button and keeps the full policy (JEF-522)', () => {
    render(<PricingPage />);

    const cta = screen.getAllByRole('link', { name: en['plan.upgradeTitle'] })[0]!;
    const line = screen.getByTestId('guarantee-short');
    expect(line).toHaveTextContent(en['pricing.guaranteeShort']);
    expect(cta.nextElementSibling).toBe(line);
    expect(screen.getAllByText(en['plan.refundPolicy']).length).toBeGreaterThan(0);
  });

  describe('FAQ (JEF-519)', () => {
    it('answers the six questions, collapsed, with the refund and AI text from the page', () => {
      render(<PricingPage />);

      for (const id of ['plan', 'limit', 'cancel', 'refund', 'ai-key', 'passes']) {
        expect(screen.getByTestId(`faq-${id}`)).not.toHaveAttribute('open');
      }
      expect(screen.getByTestId('faq-refund')).toHaveTextContent(en['plan.refundPolicy']);
      expect(screen.getByTestId('faq-ai-key')).toHaveTextContent(en['faq.aiKey.a']);
    });

    it('emits FAQPage JSON-LD for exactly those questions', () => {
      const { container } = render(<PricingPage />);
      const script = container.querySelector('script[type="application/ld+json"]');
      const data = JSON.parse(script?.textContent ?? '{}') as {
        '@type': string;
        mainEntity: { name: string }[];
      };

      expect(data['@type']).toBe('FAQPage');
      expect(data.mainEntity).toHaveLength(6);
      expect(data.mainEntity[1].name).toBe('What happens when I reach the 50-application limit?');
    });

    it('quotes the limits from PLAN_LIMITS: a changed limit fails here until the FAQ follows', () => {
      const applications = /APPLICATIONS_PER_USER: (\d+),/.exec(API_CONSTANTS)?.[1];
      const freeMb = /DOCUMENT_STORAGE_LIMIT_BYTES: (\d+) \* 1024 \* 1024,/.exec(
        API_CONSTANTS,
      )?.[1];
      const proGb = /documentBytes: (\d+) \* 1024 \* 1024 \* 1024,/.exec(API_CONSTANTS)?.[1];
      const credits = /aiCreditsPerMonth: ([1-9]\d*),/.exec(API_CONSTANTS)?.[1];

      render(<PricingPage />);
      const plan = screen.getByTestId('faq-plan');
      expect(plan).toHaveTextContent(`up to ${applications} applications`);
      expect(plan).toHaveTextContent(`${freeMb} MB of documents`);
      expect(plan).toHaveTextContent(`raises storage to ${proGb} GB`);
      expect(plan).toHaveTextContent(`${credits} AI credits/month`);
      expect(screen.getByTestId('faq-limit')).toHaveTextContent(
        `${applications}-application limit`,
      );
    });

    it('quotes the pass and monthly prices from the pricing keys', () => {
      render(<PricingPage />);
      const passes = screen.getByTestId('faq-passes');
      expect(passes).toHaveTextContent(en['pricing.pass3Price']);
      expect(passes).toHaveTextContent(en['pricing.pass6Price']);
      expect(passes).toHaveTextContent(`${en['pricing.monthlyPrice']} a month`);
    });
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
      render(<PricingPage />);
      const row = within(screen.getByRole('row', { name: /AI with your own key/ }));
      expect(row.getAllByText('Unlimited')).toHaveLength(2);
      expect(screen.getByRole('table').textContent).not.toMatch(/own key.*a month/);
    });

    it('shows hosted AI as Pro-only: no credits on Free, 300 on Pro (JEF-451)', () => {
      expect(API_CONSTANTS).toMatch(/aiCreditsPerMonth: 0,/);
      expect(API_CONSTANTS).toMatch(/aiCreditsPerMonth: 300,/);
      expect(en['pricing.proAiCredits']).toBe('300 AI credits/month, fair use');
      render(<PricingPage />);
      const row = within(screen.getByRole('row', { name: /Trakwyn AI \(no key needed\)/ }));
      expect(row.getByText('Not included')).toBeInTheDocument();
      expect(row.getByText('300 AI credits/month, fair use')).toBeInTheDocument();
    });

    it('answers "Is AI free?" and "What does Pro add?" in one sentence, with the credits from the table', () => {
      render(<PricingPage />);
      const summary = screen.getByTestId('ai-summary');
      expect(summary).toHaveTextContent('Use AI free with your own key');
      expect(summary).toHaveTextContent(`Pro includes ${en['pricing.proAiCredits']}`);
    });

    it('lists exactly the features the API gates, with MCP the only one on Free', () => {
      const free = /PLAN_FEATURES = \{\s*free: \{([^}]*)\}/.exec(API_CONSTANTS)?.[1] ?? '';
      // `companyWebResearch` (JEF-538) adds web search to a company briefing; it
      // is not a pricing row, and a Free user still gets the briefing itself.
      const gatedOnFree = [...free.matchAll(/(\w+): false/g)]
        .map((match) => match[1])
        .filter((feature) => feature !== 'companyWebResearch');
      expect(gatedOnFree).toHaveLength(5);
      expect(free.match(/(\w+): true/g)).toEqual(['mcpAccess: true']);
    });
  });
});
