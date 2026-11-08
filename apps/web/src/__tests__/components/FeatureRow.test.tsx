import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({ t: (key: string) => `t:${key}` }),
}));

import { FeatureRow } from '#/components/marketing/FeatureRow';

const base = {
  titleKey: 'landing.tracking',
  descriptionKey: 'landing.trackingDescription',
  to: '/features/tracking',
  screenshot: 'board',
} as const;

describe('FeatureRow', () => {
  it('shows the title, copy, Learn more link and screenshot', () => {
    render(<FeatureRow {...base} />);

    expect(screen.getByRole('heading', { name: 't:landing.tracking' })).toBeInTheDocument();
    expect(screen.getByText('t:landing.trackingDescription')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /t:landing\.learnMore/ })).toHaveAttribute(
      'href',
      '/features/tracking',
    );
    expect(screen.getAllByAltText('t:screenshots.board.alt')).toHaveLength(2);
    expect(screen.queryByText('t:plan.badgePro')).toBeNull();
  });

  it('reverses the sides and shows a Pro tag when asked', () => {
    const { container } = render(<FeatureRow {...base} reversed pro />);

    expect(container.querySelector('.lg\\:order-2')).not.toBeNull();
    expect(container.querySelector('.lg\\:order-1')).not.toBeNull();
    expect(screen.getByText('t:plan.badgePro')).toBeInTheDocument();
  });
});
