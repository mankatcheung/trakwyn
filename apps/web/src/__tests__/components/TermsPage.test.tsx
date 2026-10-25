import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { TermsPage } from '#/routes/-components/TermsPage';

describe('TermsPage', () => {
  it('renders the terms with a heading and a last-updated date', () => {
    render(<TermsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText(/^last updated:/i)).toBeInTheDocument();
  });

  it('covers acceptable use, content ownership, and termination', () => {
    render(<TermsPage />);

    expect(screen.getByRole('heading', { name: 'Acceptable use' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your content' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Termination' })).toBeInTheDocument();
  });

  it('links to the Privacy Policy', () => {
    render(<TermsPage />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('links back to the homepage', () => {
    render(<TermsPage />);

    expect(screen.getByRole('link', { name: 'Back to Trakwyn' })).toHaveAttribute('href', '/');
  });

  it('provides a contact email', () => {
    render(<TermsPage />);

    const link = screen.getByRole('link', { name: 'contact@trakwyn.com' });
    expect(link).toHaveAttribute('href', 'mailto:contact@trakwyn.com');
  });

  it('covers the Clipper browser extension', () => {
    render(<TermsPage />);

    expect(screen.getByRole('heading', { name: 'Browser extension' })).toBeInTheDocument();
  });

  it('names the merchant of record as the seller of paid plans (JEF-431)', () => {
    render(<TermsPage />);

    expect(screen.getByRole('heading', { name: 'Paid plans and payments' })).toBeInTheDocument();
    expect(screen.getByText(/our merchant of record, Polar/)).toBeInTheDocument();
    expect(screen.getByText(/Polar is the seller of Pro to you/)).toBeInTheDocument();
  });

  it('states the prices, renewal, refund and founder price rules (JEF-431)', () => {
    render(<TermsPage />);

    expect(screen.getByText(/Prices are in US dollars/)).toBeInTheDocument();
    expect(screen.getByText(/pass is a one-off payment/)).toBeInTheDocument();
    expect(screen.getByText(/within 14 days of buying for a full refund/)).toBeInTheDocument();
    expect(screen.getByText(/founder price of \$9 a month stays at \$9/)).toBeInTheDocument();
  });

  it('no longer says Trakwyn is free of charge (JEF-431)', () => {
    render(<TermsPage />);

    expect(screen.queryByText(/currently provided free of charge/)).toBeNull();
    expect(screen.getByText(/Free plan and a paid Pro plan/)).toBeInTheDocument();
  });

  it('says deleting the account cancels a subscription (JEF-431)', () => {
    render(<TermsPage />);

    expect(
      screen.getByText(/cancels any active Pro subscription straight away/),
    ).toBeInTheDocument();
  });
});
