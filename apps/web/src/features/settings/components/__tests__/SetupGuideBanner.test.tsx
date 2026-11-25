import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { BookOpenIcon } from 'lucide-react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import { SetupGuideBanner } from '#/features/settings/components/SetupGuideBanner';

describe('SetupGuideBanner (JEF-693)', () => {
  const renderBanner = () =>
    render(<SetupGuideBanner icon={BookOpenIcon} textKey="guides.aiMcpSetup.bannerAiText" />);

  it('says what the guide covers and links to it', () => {
    renderBanner();

    expect(screen.getByText(/The setup guide covers picking a provider/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read the guide' })).toHaveAttribute(
      'href',
      '/ai-mcp-setup',
    );
  });

  it('is a standard white card with the accent on the link only', () => {
    const { container } = renderBanner();

    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('bg-white');
    expect(card.className).not.toMatch(/blue/);
    expect(screen.getByRole('link', { name: 'Read the guide' }).className).toContain(
      'text-blue-800',
    );
  });

  it('hides its icon from assistive tech', () => {
    const { container } = renderBanner();

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
