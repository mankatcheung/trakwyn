import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LegalPageLayout } from '#/features/legal/components/LegalPageLayout';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

describe('LegalPageLayout', () => {
  it('titles the page from a translation key and dates it', () => {
    render(
      <LegalPageLayout titleKey="auth.privacyPolicy" lastUpdated="August 22, 2026">
        <p>Policy text</p>
      </LegalPageLayout>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText(/Last updated: .*August.*22.*2026/)).toBeInTheDocument();
  });

  it('renders the document inside the main landmark', () => {
    render(
      <LegalPageLayout titleKey="auth.termsOfService" lastUpdated="August 22, 2026">
        <p>Policy text</p>
      </LegalPageLayout>,
    );

    expect(screen.getByRole('main')).toContainElement(screen.getByText('Policy text'));
  });

  it('follows the page it is given when it renders again', () => {
    const { rerender } = render(
      <LegalPageLayout titleKey="auth.privacyPolicy" lastUpdated="August 22, 2026">
        <p>First</p>
      </LegalPageLayout>,
    );
    rerender(
      <LegalPageLayout titleKey="auth.privacyPolicy" lastUpdated="August 22, 2026">
        <p>First</p>
      </LegalPageLayout>,
    );
    expect(screen.getByText('First')).toBeInTheDocument();

    rerender(
      <LegalPageLayout titleKey="auth.termsOfService" lastUpdated="September 1, 2026">
        <p>Second</p>
      </LegalPageLayout>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText(/September.*1.*2026/)).toBeInTheDocument();
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });

  it('links back to the home page from the brand and from the foot', () => {
    render(
      <LegalPageLayout titleKey="auth.accessibility" lastUpdated="August 22, 2026">
        <p>Policy text</p>
      </LegalPageLayout>,
    );

    expect(screen.getByRole('link', { name: 'Trakwyn' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Back to Trakwyn' })).toHaveAttribute('href', '/');
  });
});
