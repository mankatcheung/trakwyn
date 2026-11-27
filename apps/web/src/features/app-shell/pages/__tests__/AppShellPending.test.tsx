import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SECTION_GROUPS } from '#/features/application-detail/lib/sections';
import { SETTINGS_SECTIONS } from '#/features/settings/lib/settingsSections';
import { AppShellPending } from '../AppShellPending';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/dashboard') }));

const { mockHasSessionHint } = vi.hoisted(() => ({ mockHasSessionHint: vi.fn(() => true) }));

vi.mock('#/features/auth/lib/sessionHint', () => ({ hasSessionHint: mockHasSessionHint }));

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: mockPathname() } }),
}));

// Rendered to a string with no providers at all: this is what the server sends,
// so it may not depend on the language, theme or query client.
function serverRender(pathname: string): HTMLElement {
  mockPathname.mockReturnValue(pathname);
  const container = document.createElement('div');
  container.innerHTML = renderToString(<AppShellPending />);
  return container;
}

const sectionSider = (root: HTMLElement) =>
  root.querySelector('[data-testid$="-sider-pending"]')?.getAttribute('data-testid') ?? null;

describe('AppShellPending', () => {
  it('server-renders the sider, the mobile header and the bottom bar, marked busy', () => {
    const root = serverRender('/dashboard');

    expect(root.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(root.querySelector('aside')).not.toBeNull();
    expect(root.querySelector('header')).not.toBeNull();
    expect(root.querySelector('[data-testid="bottom-nav-pending"]')).not.toBeNull();
  });

  it.each(['/dashboard', '/settings/ai', '/profile', '/applications/abc'])(
    'carries no translatable text on %s, since the server cannot know the language',
    (pathname) => {
      const text = serverRender(pathname).textContent ?? '';

      expect(text.replaceAll('Trakwyn', '').trim()).toBe('');
    },
  );

  // A signed-out visitor is redirected to /login before React hydrates, so a
  // frame in the server HTML would not match what the client renders.
  it('renders nothing without the session hint', () => {
    mockHasSessionHint.mockReturnValueOnce(false);

    expect(serverRender('/dashboard').innerHTML).toBe('');
  });

  it('marks the nav item of the current page', () => {
    const root = serverRender('/calendar');

    expect(root.querySelector('aside [data-active="true"]')?.getAttribute('data-nav')).toBe(
      '/calendar',
    );
  });

  it.each([
    ['/dashboard', null],
    ['/settings/profile', 'settings-sider-pending'],
    ['/profile', 'profile-sider-pending'],
    ['/applications/abc123', 'application-sider-pending'],
    ['/applications/abc123/', 'application-sider-pending'],
    ['/applications', null],
    ['/applications/new', null],
    ['/applications/board', null],
    ['/applications/trash', null],
    ['/applications/abc123/edit', null],
  ])('picks the section sider for %s', (pathname, expected) => {
    expect(sectionSider(serverRender(pathname))).toBe(expected);
  });

  it('draws one settings row per settings section', () => {
    const root = serverRender('/settings/ai');

    expect(root.querySelectorAll('[data-testid="settings-sider-pending"] [data-row]')).toHaveLength(
      SETTINGS_SECTIONS.length,
    );
  });

  it('draws one row per application section', () => {
    const root = serverRender('/applications/abc123');

    expect(
      root.querySelectorAll('[data-testid="application-sider-pending"] [data-row]'),
    ).toHaveLength(SECTION_GROUPS.flatMap((g) => g.sections).length);
  });
});
