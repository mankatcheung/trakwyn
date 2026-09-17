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
});
