import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LegalFooterLinks } from '#/features/legal/components/LegalFooterLinks';

const { requestOpenCookiePreferences } = vi.hoisted(() => ({
  requestOpenCookiePreferences: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('#/features/legal/lib/cookieConsent', () => ({ requestOpenCookiePreferences }));

describe('LegalFooterLinks', () => {
  it('links the three policies', () => {
    render(<LegalFooterLinks />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: 'Accessibility' })).toHaveAttribute(
      'href',
      '/accessibility',
    );
  });

  it('reopens the cookie preferences from its button', () => {
    render(<LegalFooterLinks />);

    fireEvent.click(screen.getByRole('button', { name: 'Cookie preferences' }));

    expect(requestOpenCookiePreferences).toHaveBeenCalledOnce();
  });

  it('is centred and small by default, and takes a class from the page when given one', () => {
    const { container, rerender } = render(<LegalFooterLinks />);
    expect(container.firstChild).toHaveClass('justify-center', 'text-xs');

    rerender(<LegalFooterLinks className="custom-footer" />);
    expect(container.firstChild).toHaveClass('custom-footer');
    expect(container.firstChild).not.toHaveClass('justify-center');
  });
});
