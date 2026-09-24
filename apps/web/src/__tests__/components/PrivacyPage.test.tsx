import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { PrivacyPage } from '#/routes/-components/PrivacyPage';

describe('PrivacyPage', () => {
  it('renders the policy with a heading and a last-updated date', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText(/^last updated:/i)).toBeInTheDocument();
  });

  it('covers what the app actually collects', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('heading', { name: 'Account information' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Security and device information' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'AI features, if you use them' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cookies' })).toBeInTheDocument();
  });

  it('links back to the homepage', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('link', { name: 'Back to Trakwyn' })).toHaveAttribute('href', '/');
  });

  it('provides a contact email', () => {
    render(<PrivacyPage />);

    const link = screen.getByRole('link', { name: 'contact@trakwyn.com' });
    expect(link).toHaveAttribute('href', 'mailto:contact@trakwyn.com');
  });
});
