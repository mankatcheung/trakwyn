import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import en from '#/i18n/en.json';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
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
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

import { PricingPage } from '#/routes/-components/PricingPage';

const API_CONSTANTS = readFileSync(
  join(import.meta.dirname, '..', '..', '..', '..', 'api', 'src', 'use-cases', 'constants.ts'),
  'utf8',
);

describe('PricingPage', () => {
  beforeEach(() => isLoggedIn.mockReturnValue(false));

  it('renders the three ways to pay for Pro', () => {
    render(<PricingPage />);

    expect(screen.getByText('Monthly subscription')).toBeInTheDocument();
    expect(screen.getByText('3-month pass')).toBeInTheDocument();
    expect(screen.getByText('6-month pass')).toBeInTheDocument();
    expect(screen.getAllByText('$12').length).toBeGreaterThan(0);
    expect(screen.getByText('$29')).toBeInTheDocument();
    expect(screen.getByText('$49')).toBeInTheDocument();
  });

  it('states the tax and refund terms', () => {
    render(<PricingPage />);

    expect(screen.getByText(/include VAT|includes VAT/)).toBeInTheDocument();
    expect(screen.getByText(/full refund/)).toBeInTheDocument();
  });

  it('never mentions the founder price', () => {
    const { container } = render(<PricingPage />);

    expect(container.textContent).not.toMatch(/founder/i);
    expect(container.textContent).not.toContain('$9');
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

    it('shows the Free AI allowance', () => {
      expect(API_CONSTANTS).toMatch(/aiActionsPerMonth: 5,/);
      expect(en['pricing.freeAi']).toBe('5 a month');
    });

    it('lists exactly the features the API gates', () => {
      const free = /PLAN_FEATURES = \{\s*free: \{([^}]*)\}/.exec(API_CONSTANTS)?.[1] ?? '';
      expect(free.match(/: false/g)).toHaveLength(5);
      expect(free.match(/: true/g)).toBeNull();
    });
  });
});
