import { describe, expect, it, vi } from 'vitest';
import en from '#/i18n/en.json';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('#/graphql/client', () => ({ hasSessionCookie: () => false }));
vi.mock('#/lib/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));

vi.mock('#/lib/i18n', () => ({
  LOCALE_OPTIONS: [{ value: 'en', label: 'English' }],
  useLocale: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

import { AiMcpSetupPage } from '#/features/marketing/pages/AiMcpSetupPage';

describe('AiMcpSetupPage', () => {
  it('renders the headline and both part headings', () => {
    render(<AiMcpSetupPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Connect your own AI key and an MCP client',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Part 1 — Bring your own AI key' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Part 2 — Connect an MCP client' }),
    ).toBeInTheDocument();
  });

  it('marks Guides as the current header section (JEF-678)', () => {
    render(<AiMcpSetupPage />);

    const guides = within(screen.getByRole('banner')).getByRole('link', { name: 'Guides' });
    expect(guides.className).toContain('underline');
  });

  it('leads with OAuth as the recommended way to connect a client', () => {
    render(<AiMcpSetupPage />);

    expect(screen.getByRole('heading', { name: 'Connect with OAuth' })).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Advanced: connect with an API token' }),
    ).toBeInTheDocument();
  });

  it('switches the provider note when a different tab is selected', () => {
    render(<AiMcpSetupPage />);

    expect(screen.getByText(/openrouter\.ai\/keys/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Anthropic' }));
    expect(screen.getByText(/console\.anthropic\.com/)).toBeInTheDocument();
  });

  it('links back to Settings for existing users', () => {
    render(<AiMcpSetupPage />);

    expect(screen.getByRole('link', { name: 'Go to Settings → AI' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
    expect(screen.getByRole('link', { name: 'Go to Settings → Integrations' })).toHaveAttribute(
      'href',
      '/settings/integrations',
    );
  });
});
