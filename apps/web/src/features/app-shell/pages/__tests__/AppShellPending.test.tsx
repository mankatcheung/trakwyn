import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { SECTION_GROUPS } from '#/features/application-detail/lib/sections';
import { SETTINGS_SECTIONS } from '#/features/settings/lib/settingsSections';
import { AppShellPending } from '../AppShellPending';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/dashboard') }));

const { mockHasSessionCookie } = vi.hoisted(() => ({ mockHasSessionCookie: vi.fn(() => true) }));

vi.mock('#/graphql/client', () => ({ hasSessionCookie: mockHasSessionCookie }));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: mockPathname() } }),
}));

// Rendered with no providers at all: the frame is up before the app is ready,
// so it may not depend on the language, theme or query client.
function browserRender(pathname: string): HTMLElement {
  mockPathname.mockReturnValue(pathname);
  return render(<AppShellPending />).container;
}

const sectionSider = (root: HTMLElement) =>
  root.querySelector('[data-testid$="-sider-pending"]')?.getAttribute('data-testid') ?? null;

describe('AppShellPending', () => {
  it('renders the sider, the mobile header and the bottom bar, marked busy', () => {
    const root = browserRender('/dashboard');

    expect(root.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(root.querySelector('aside')).not.toBeNull();
    expect(root.querySelector('header')).not.toBeNull();
    expect(root.querySelector('[data-testid="bottom-nav-pending"]')).not.toBeNull();
  });

  it.each(['/dashboard', '/settings/ai', '/profile', '/applications/abc'])(
    'carries no translatable text on %s, since its labels are placeholders',
    (pathname) => {
      const text = browserRender(pathname).textContent ?? '';

      expect(text.replaceAll('Trakwyn', '').trim()).toBe('');
    },
  );

  it('renders nothing on the server, even with a session', () => {
    expect(renderToString(<AppShellPending />)).toBe('');
  });

  // The guard redirects a signed-out visitor to /login.
  it('renders nothing without the session cookie', () => {
    mockHasSessionCookie.mockReturnValueOnce(false);

    expect(browserRender('/dashboard').innerHTML).toBe('');
  });

  it('marks the nav item of the current page', () => {
    const root = browserRender('/calendar');

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
    expect(sectionSider(browserRender(pathname))).toBe(expected);
  });

  it('draws one settings row per settings section', () => {
    const root = browserRender('/settings/ai');

    expect(root.querySelectorAll('[data-testid="settings-sider-pending"] [data-row]')).toHaveLength(
      SETTINGS_SECTIONS.length,
    );
  });

  it('draws one row per application section', () => {
    const root = browserRender('/applications/abc123');

    expect(
      root.querySelectorAll('[data-testid="application-sider-pending"] [data-row]'),
    ).toHaveLength(SECTION_GROUPS.flatMap((g) => g.sections).length);
  });
});
