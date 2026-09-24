import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { AccessibilityPage } from '#/routes/-components/AccessibilityPage';

describe('AccessibilityPage', () => {
  it('renders the statement with a heading and a last-updated date', () => {
    render(<AccessibilityPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Accessibility' })).toBeInTheDocument();
    expect(screen.getByText(/^last updated:/i)).toBeInTheDocument();
  });

  it('states the WCAG target as a goal, not a claimed certification', () => {
    render(<AccessibilityPage />);

    expect(screen.getByRole('heading', { name: 'Our target' })).toBeInTheDocument();
    expect(
      screen.getByText(/target we’re working toward, not a certification/i),
    ).toBeInTheDocument();
  });

  it('covers what has been done and known limitations', () => {
    render(<AccessibilityPage />);

    expect(screen.getByRole('heading', { name: 'What we’ve done' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Known limitations' })).toBeInTheDocument();
  });

  it('links back to the homepage', () => {
    render(<AccessibilityPage />);

    expect(screen.getByRole('link', { name: 'Back to Trakwyn' })).toHaveAttribute('href', '/');
  });

  it('provides a contact email', () => {
    render(<AccessibilityPage />);

    const link = screen.getByRole('link', { name: 'contact@trakwyn.com' });
    expect(link).toHaveAttribute('href', 'mailto:contact@trakwyn.com');
  });
});
