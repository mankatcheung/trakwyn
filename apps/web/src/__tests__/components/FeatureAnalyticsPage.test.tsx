import { describe, expect, it, vi } from 'vitest';
import en from '#/i18n/en.json';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('#/graphql/client', () => ({ hasSessionCookie: () => false }));
vi.mock('#/lib/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));

vi.mock('#/lib/i18n', () => ({
  LOCALE_OPTIONS: [{ value: 'en', label: 'English' }],
  useLocale: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    // Resolve against the real English bundle so assertions on rendered copy
    // keep working as keys are added (falls back to the key itself).
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

import { FeatureAnalyticsPage } from '#/routes/features/-components/FeatureAnalyticsPage';

describe('FeatureAnalyticsPage', () => {
  it('renders the headline and the real analytics screenshot', () => {
    render(<FeatureAnalyticsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: "See what's actually working" }),
    ).toBeInTheDocument();
    expect(screen.getAllByAltText(en['screenshots.analytics.alt'])).toHaveLength(2);
  });

  it('renders the three benefit sections', () => {
    render(<FeatureAnalyticsPage />);

    expect(
      screen.getByRole('heading', { name: 'Your funnel, stage by stage' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: "Know when you're being ghosted" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Where your offers come from' }),
    ).toBeInTheDocument();
  });
});
