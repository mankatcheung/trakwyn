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

import { FeatureTrackingPage } from '#/routes/features/-components/FeatureTrackingPage';

describe('FeatureTrackingPage', () => {
  it('renders the headline and the real board screenshot in both themes', () => {
    render(<FeatureTrackingPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Every application, one board' }),
    ).toBeInTheDocument();
    expect(screen.getAllByAltText(en['screenshots.board.alt'])).toHaveLength(2);
  });

  it('renders the three benefit sections', () => {
    render(<FeatureTrackingPage />);

    expect(screen.getByRole('heading', { name: 'Add a job in seconds' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Board or list — your call' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nothing slips through' })).toBeInTheDocument();
  });
});
