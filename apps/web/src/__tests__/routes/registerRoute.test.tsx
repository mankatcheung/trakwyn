import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@tanstack/react-router';

const { mockHasSessionCookie } = vi.hoisted(() => ({ mockHasSessionCookie: vi.fn() }));

vi.mock('#/graphql/client', () => ({ hasSessionCookie: mockHasSessionCookie, gqlClient: {} }));
vi.mock('../../features/auth/pages/RegisterPage', () => ({ RegisterPage: () => null }));

type Options = { ssr?: boolean; beforeLoad: () => unknown };

async function loadOptions(): Promise<Options> {
  const mod = await import('#/routes/register');
  return (mod.Route as unknown as { options: Options }).options;
}

describe('/register route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects a signed-in visitor to the dashboard', async () => {
    mockHasSessionCookie.mockReturnValue(true);
    const { beforeLoad } = await loadOptions();

    let caught: unknown;
    try {
      beforeLoad();
    } catch (err) {
      caught = err;
    }

    expect(isRedirect(caught)).toBe(true);
    expect((caught as { options: { to: string } }).options.to).toBe('/dashboard');
  });

  it('shows the form to a visitor without a session', async () => {
    mockHasSessionCookie.mockReturnValue(false);
    const { beforeLoad } = await loadOptions();

    expect(() => beforeLoad()).not.toThrow();
  });

  it('stays client-rendered, since the session cookie is only readable there', async () => {
    const { ssr } = await loadOptions();

    expect(ssr).toBe(false);
  });
});
