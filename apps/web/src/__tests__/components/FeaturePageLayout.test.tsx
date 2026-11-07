import { describe, expect, it, vi } from 'vitest';
import en from '#/i18n/en.json';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('#/components/marketing/MarketingHeader', () => ({
  MarketingHeader: ({ activeFeatures }: { activeFeatures?: boolean }) => (
    <div data-testid="header" data-active-features={String(!!activeFeatures)} />
  ),
}));

vi.mock('#/components/marketing/MarketingFooter', () => ({
  MarketingFooter: () => <div data-testid="footer" />,
}));

vi.mock('#/lib/i18n', () => ({
  LOCALE_OPTIONS: [{ value: 'en', label: 'English' }],
  useLocale: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    formatDate: (value: Date | string | number) => new Date(value).toDateString(),
    formatNumber: (value: number) => String(value),
    // Resolve against the real English bundle so assertions on rendered copy
    // keep working as keys are added (falls back to the key itself).
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

import { FeaturePageLayout } from '#/components/marketing/FeaturePageLayout';

describe('FeaturePageLayout', () => {
  it('renders the hero, header (with Features active) and footer', () => {
    render(
      <FeaturePageLayout
        eyebrowIcon={Sparkles}
        eyebrowLabel="AI assistant"
        title="An assistant that knows your job search"
        description="Ask it about any application."
        heroVisual={<div>hero visual</div>}
        benefits={[]}
        ctaHeadline="Talk through your search"
      />,
    );

    expect(screen.getByTestId('header')).toHaveAttribute('data-active-features', 'true');
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'An assistant that knows your job search' }),
    ).toBeInTheDocument();
    expect(screen.getByText('AI assistant')).toBeInTheDocument();
    expect(screen.getByText('hero visual')).toBeInTheDocument();
  });

  it('renders every benefit with its own heading and visual', () => {
    render(
      <FeaturePageLayout
        eyebrowIcon={Sparkles}
        eyebrowLabel="AI assistant"
        title="Title"
        description="Description"
        heroVisual={<div />}
        benefits={[
          { title: 'First benefit', description: 'First description', visual: <div>viz-1</div> },
          { title: 'Second benefit', description: 'Second description', visual: <div>viz-2</div> },
        ]}
        ctaHeadline="Get going"
      />,
    );

    expect(screen.getByRole('heading', { name: 'First benefit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second benefit' })).toBeInTheDocument();
    expect(screen.getByText('viz-1')).toBeInTheDocument();
    expect(screen.getByText('viz-2')).toBeInTheDocument();
  });

  it('links the hero and closing CTAs to /register', () => {
    render(
      <FeaturePageLayout
        eyebrowIcon={Sparkles}
        eyebrowLabel="AI assistant"
        title="Title"
        description="Description"
        heroVisual={<div />}
        benefits={[]}
        ctaHeadline="Get going"
      />,
    );

    // Hero and closing band share one label.
    const ctas = screen.getAllByRole('link', { name: 'Start for free' });
    expect(ctas).toHaveLength(2);
    ctas.forEach((cta) => expect(cta).toHaveAttribute('href', '/register'));
    expect(screen.queryByRole('link', { name: 'Get started for free' })).not.toBeInTheDocument();
  });
});
