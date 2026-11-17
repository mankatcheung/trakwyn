import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHasSessionCookie } = vi.hoisted(() => ({
  mockHasSessionCookie: vi.fn().mockReturnValue(false),
}));

vi.mock('#/graphql/client', () => ({
  hasSessionCookie: mockHasSessionCookie,
  gqlClient: {},
}));

// The page component is not what's under test here — the beforeLoad guard is.
vi.mock('#/features/auth/pages/LoginPage', () => ({ LoginPage: () => null }));

type RedirectError = Error & { redirectOpts?: { to: string } };

/** Mirrors TanStack Router: `redirect` aborts navigation by throwing. */
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    redirect: (opts: { to: string }): never => {
      const error = new Error('REDIRECT') as RedirectError;
      error.redirectOpts = opts;
      throw error;
    },
  };
});

interface BeforeLoadOpts {
  search: { returnTo?: string };
}

async function loadGuard(): Promise<(opts: BeforeLoadOpts) => unknown> {
  const mod = await import('#/routes/login');
  // The generated Route type hides its own options object; reach past it.
  const { beforeLoad } =
    (mod.Route as unknown as { options?: { beforeLoad?: (opts: BeforeLoadOpts) => unknown } })
      .options ?? (mod.Route as unknown as { beforeLoad: (opts: BeforeLoadOpts) => unknown });
  if (!beforeLoad) throw new Error('guard not found');
  return (opts) => beforeLoad(opts);
}

describe('/login route guard (JEF-233)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSessionCookie.mockReturnValue(false);
  });

  it('shows the form to unauthenticated visitors regardless of returnTo', async () => {
    const guard = await loadGuard();

    expect(() => guard({ search: { returnTo: '/applications' } })).not.toThrow();
  });

  it('sends already-authenticated visitors to their returnTo destination', async () => {
    mockHasSessionCookie.mockReturnValue(true);
    const guard = await loadGuard();

    let caught: RedirectError | undefined;
    try {
      guard({ search: { returnTo: '/applications?status=applied' } });
    } catch (err) {
      caught = err as RedirectError;
    }

    expect(caught!.redirectOpts).toEqual({ to: '/applications?status=applied' });
  });

  it('defaults an authenticated visitor without returnTo to the dashboard', async () => {
    mockHasSessionCookie.mockReturnValue(true);
    const guard = await loadGuard();

    let caught: RedirectError | undefined;
    try {
      guard({ search: {} });
    } catch (err) {
      caught = err as RedirectError;
    }

    expect(caught!.redirectOpts).toEqual({ to: '/dashboard' });
  });

  it('never redirects an authenticated visitor back into /login', async () => {
    // A crafted ?returnTo=/login would otherwise loop the guard forever.
    mockHasSessionCookie.mockReturnValue(true);
    const guard = await loadGuard();

    let caught: RedirectError | undefined;
    try {
      guard({ search: { returnTo: '/login' } });
    } catch (err) {
      caught = err as RedirectError;
    }

    expect(caught!.redirectOpts).toEqual({ to: '/dashboard' });
  });
});
