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

  it('describes what the Clipper browser extension reads, stores and sends', () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { name: 'The Trakwyn Clipper browser extension' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reads the job posting on the page you’re viewing/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Read with AI/)).toBeInTheDocument();
    expect(screen.getByText(/session storage/i)).toBeInTheDocument();
    // The opt-in persisted token is disclosed, not only the session copy.
    expect(screen.getByText(/Keep me signed in/)).toBeInTheDocument();
    expect(screen.getByText(/local storage/i)).toBeInTheDocument();
    // The options page and its API address setting are gone (JEF-418).
    expect(screen.queryByText(/API address/i)).not.toBeInTheDocument();
    expect(screen.getByText(/anonymous error reports/i)).toBeInTheDocument();
  });

  it('says the merchant of record processes payment data (JEF-431)', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument();
    expect(
      screen.getByText(/our merchant of record, Polar, collects your payment details/),
    ).toBeInTheDocument();
    expect(screen.getByText(/We never see or store your card number/)).toBeInTheDocument();
  });

  it('says Polar keeps its own purchase record after the account is deleted (JEF-431)', () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Polar keeps its own record of your purchases/)).toBeInTheDocument();
  });

  it('lists the payment provider among the service providers (JEF-431)', () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(/our payment provider \(Polar, the merchant of record\)/),
    ).toBeInTheDocument();
  });
});
