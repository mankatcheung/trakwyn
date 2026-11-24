import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const trackCta = vi.fn();

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
    <a href={to} className={className} onClick={(e) => (e.preventDefault(), onClick?.())}>
      {children}
    </a>
  ),
}));
vi.mock('#/lib/analytics', () => ({ trackCta: (...args: unknown[]) => trackCta(...args) }));
vi.mock('#/lib/i18n', () => ({ useLocale: () => ({ t: () => 'Start for free' }) }));

import { MarketingClosingCta } from '#/features/marketing/components/MarketingClosingCta';

describe('MarketingClosingCta', () => {
  beforeEach(() => trackCta.mockClear());

  it('shows the page headline and a register button on a quiet stone surface', () => {
    render(<MarketingClosingCta headline="Talk through your search" />);

    expect(screen.getByRole('heading', { name: 'Talk through your search' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start for free' })).toHaveAttribute(
      'href',
      '/register',
    );
    const section = screen.getByRole('heading').closest('section');
    expect(section).toHaveClass('bg-stone-100');
    expect(section).not.toHaveClass('bg-blue-950');
  });

  it('reports the click only when a location is given', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MarketingClosingCta headline="H" />);
    await user.click(screen.getByRole('link', { name: 'Start for free' }));
    expect(trackCta).not.toHaveBeenCalled();

    rerender(<MarketingClosingCta headline="H" location="feature_closing" />);
    await user.click(screen.getByRole('link', { name: 'Start for free' }));
    expect(trackCta).toHaveBeenCalledWith('get_started_free', 'feature_closing');
  });

  it('renders an optional secondary link', () => {
    const { rerender } = render(<MarketingClosingCta headline="H" />);
    expect(screen.getAllByRole('link')).toHaveLength(1);

    rerender(
      <MarketingClosingCta headline="H" secondaryLink={{ to: '/pricing', label: 'See pricing' }} />,
    );
    expect(screen.getByRole('link', { name: 'See pricing' })).toHaveAttribute('href', '/pricing');
  });
});
