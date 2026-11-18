import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/settings/profile') }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  Outlet: () => <div data-testid="outlet" />,
  useLocation: () => ({ pathname: mockPathname() }),
}));

import { SettingsLayout } from '#/features/settings/pages/SettingsLayout';

const NAV = [
  ['Profile', '/settings/profile'],
  ['Security', '/settings/security'],
  ['AI', '/settings/ai'],
  ['Integrations', '/settings/integrations'],
  ['Notifications', '/settings/notifications'],
  ['Plan', '/settings/plan'],
  ['Data', '/settings/data'],
  ['Danger zone', '/settings/danger-zone'],
] as const;

describe('SettingsLayout', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/settings/profile');
  });

  it('renders the heading, the child route and every section link in order', () => {
    render(<SettingsLayout />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(NAV.map(([, to]) => to));
  });

  it('keeps the danger zone last', () => {
    render(<SettingsLayout />);

    const links = screen.getAllByRole('link');
    expect(links.at(-1)).toHaveTextContent('Danger zone');
  });

  it('highlights the section the user is in', () => {
    mockPathname.mockReturnValue('/settings/security');
    render(<SettingsLayout />);

    const links = screen.getAllByRole('link');
    const active = links.filter((link) => link.className.includes('font-medium'));
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('href', '/settings/security');
  });
});
