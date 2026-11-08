import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHasSessionCookie, mockCheckSessionGate, mockPrefetchDashboard } = vi.hoisted(() => ({
  mockHasSessionCookie: vi.fn().mockReturnValue(false),
  mockCheckSessionGate: vi.fn(),
  mockPrefetchDashboard: vi.fn(),
}));

// Only the network read is replaced; which paths are exempt is the real rule.
vi.mock('#/lib/sessionGate', () => ({ checkSessionGate: mockCheckSessionGate }));

vi.mock('#/routes/_authenticated/-dashboardQueries', () => ({
  prefetchDashboard: mockPrefetchDashboard,
}));

vi.mock('#/graphql/client', () => ({
  hasSessionCookie: mockHasSessionCookie,
  gqlClient: {},
}));

// The layout pulls in the whole authenticated app; the guard is what's
// under test here.
vi.mock('#/routes/_authenticated/-components/AuthenticatedLayout', () => ({
  AuthenticatedLayout: () => null,
}));

type RedirectError = Error & { redirectOpts?: { to: string; search?: unknown } };

/** Mirrors TanStack Router: `redirect` aborts navigation by throwing. */
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    redirect: (opts: { to: string; search?: unknown }): never => {
      const error = new Error('REDIRECT') as RedirectError;
      error.redirectOpts = opts;
      throw error;
    },
  };
});

interface BeforeLoadOpts {
  location: { href: string; pathname?: string };
  context?: { queryClient: unknown };
}

async function loadGuard(): Promise<(opts: BeforeLoadOpts) => unknown> {
  const mod = await import('#/routes/_authenticated/route');
  // The generated Route type hides its own options object; reach past it.
  const { beforeLoad } =
    (mod.Route as unknown as { options?: { beforeLoad?: (opts: BeforeLoadOpts) => unknown } })
      .options ?? (mod.Route as unknown as { beforeLoad: (opts: BeforeLoadOpts) => unknown });
  if (!beforeLoad) throw new Error('guard not found');
  return (opts) => beforeLoad(opts);
}

const FINISHED = { onboardingCompletedAt: '2026-10-01T00:00:00.000Z', onboardingGoals: [] };

interface GateOverrides {
  verification?: Record<string, unknown> | null;
  onboarding?: Record<string, unknown> | null;
}

function gate({ verification, onboarding }: GateOverrides = {}) {
  return {
    verification:
      verification === undefined ? { email: 'a@b.c', emailVerified: true } : verification,
    onboarding: onboarding === undefined ? FINISHED : onboarding,
  };
}

describe('_authenticated route guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSessionCookie.mockReturnValue(false);
    mockCheckSessionGate.mockResolvedValue(gate());
  });

  it('redirects unauthenticated visitors to /login carrying where they were headed', async () => {
    const guard = await loadGuard();

    let caught: RedirectError | undefined;
    try {
      guard({ location: { href: '/applications?status=applied' } });
    } catch (err) {
      caught = err as RedirectError;
    }

    expect(caught).toBeDefined();
    expect(caught!.redirectOpts).toEqual({
      to: '/login',
      search: { returnTo: '/applications?status=applied' },
    });
  });

  it('lets verified visitors through untouched', async () => {
    mockHasSessionCookie.mockReturnValue(true);
    const guard = await loadGuard();

    await expect(guard({ location: { href: '/dashboard' } })).resolves.toBeUndefined();
  });

  describe('email verification (JEF-438)', () => {
    it('sends an unverified account to the full-page reminder before any child route loads', async () => {
      mockHasSessionCookie.mockReturnValue(true);
      mockCheckSessionGate.mockResolvedValue(
        gate({ verification: { email: 'new@example.com', emailVerified: false } }),
      );
      const guard = await loadGuard();

      const caught = await Promise.resolve(guard({ location: { href: '/dashboard' } })).catch(
        (err: RedirectError) => err,
      );

      expect((caught as RedirectError).redirectOpts).toEqual({ to: '/verify-email-required' });
    });

    it('lets the visitor through when the check could not be made (the API still enforces the wall)', async () => {
      mockHasSessionCookie.mockReturnValue(true);
      mockCheckSessionGate.mockResolvedValue(gate({ verification: null, onboarding: null }));
      const guard = await loadGuard();

      await expect(guard({ location: { href: '/dashboard' } })).resolves.toBeUndefined();
    });

    it('does not ask for a signed-out visitor', async () => {
      const guard = await loadGuard();

      try {
        await guard({ location: { href: '/dashboard' } });
      } catch {
        // the redirect to /login
      }

      expect(mockCheckSessionGate).not.toHaveBeenCalled();
    });
  });

  describe('account deletion (JEF-463)', () => {
    it('sends an account scheduled for deletion to its own page', async () => {
      mockHasSessionCookie.mockReturnValue(true);
      mockCheckSessionGate.mockResolvedValue(
        gate({
          verification: {
            email: 'a@b.c',
            emailVerified: true,
            deletionScheduledAt: '2026-12-01T00:00:00.000Z',
          },
        }),
      );
      const guard = await loadGuard();

      const caught = await Promise.resolve(guard({ location: { href: '/dashboard' } })).catch(
        (err: RedirectError) => err,
      );

      expect((caught as RedirectError).redirectOpts).toEqual({
        to: '/account-deletion-scheduled',
      });
    });
  });

  describe('one wave (JEF-535)', () => {
    it('asks the gate once and starts the dashboard queries without waiting for it', async () => {
      mockHasSessionCookie.mockReturnValue(true);
      const queryClient = {};
      let release: (value: unknown) => void = () => {};
      mockCheckSessionGate.mockReturnValue(new Promise((resolve) => (release = resolve)));
      const guard = await loadGuard();

      const pending = guard({
        location: { href: '/dashboard', pathname: '/dashboard' },
        context: { queryClient },
      } as BeforeLoadOpts);

      expect(mockCheckSessionGate).toHaveBeenCalledTimes(1);
      expect(mockPrefetchDashboard).toHaveBeenCalledWith(queryClient, { speculative: true });
      release(gate());
      await pending;
    });

    it('does not prefetch the dashboard for other pages', async () => {
      mockHasSessionCookie.mockReturnValue(true);
      const guard = await loadGuard();

      await guard({
        location: { href: '/calendar', pathname: '/calendar' },
        context: { queryClient: {} },
      } as BeforeLoadOpts);

      expect(mockPrefetchDashboard).not.toHaveBeenCalled();
    });
  });

  describe('first-run welcome flow (JEF-460)', () => {
    const notOnboarded = { onboardingCompletedAt: null, onboardingGoals: [] };
    const notOnboardedGate = gate({ onboarding: notOnboarded });

    const attempt = async (pathname: string) => {
      const guard = await loadGuard();
      return Promise.resolve(guard({ location: { href: pathname, pathname } })).catch(
        (err: RedirectError) => err,
      );
    };

    beforeEach(() => {
      mockHasSessionCookie.mockReturnValue(true);
    });

    it('sends a user who has never finished or skipped it to /welcome', async () => {
      mockCheckSessionGate.mockResolvedValue(notOnboardedGate);

      const caught = await attempt('/dashboard');

      expect((caught as RedirectError).redirectOpts).toEqual({ to: '/welcome' });
    });

    it('lets a user who has finished or skipped it through', async () => {
      await expect(attempt('/dashboard')).resolves.toBeUndefined();
    });

    it.each(['/welcome', '/settings', '/settings/ai', '/profile', '/oauth/consent'])(
      'leaves %s alone, so the flow and the pages it links to load',
      async (pathname) => {
        mockCheckSessionGate.mockResolvedValue(notOnboardedGate);

        await expect(attempt(pathname)).resolves.toBeUndefined();
      },
    );

    it('does not treat a path that only starts with an exempt word as exempt', async () => {
      mockCheckSessionGate.mockResolvedValue(notOnboardedGate);

      const caught = await attempt('/settingsfoo');

      expect((caught as RedirectError).redirectOpts).toEqual({ to: '/welcome' });
    });

    it('lets the user through when the check could not be made', async () => {
      mockCheckSessionGate.mockResolvedValue(gate({ onboarding: null }));

      await expect(attempt('/dashboard')).resolves.toBeUndefined();
    });

    it('sends an unverified user to the wall even when the welcome flow is also pending', async () => {
      mockCheckSessionGate.mockResolvedValue(
        gate({ verification: { email: 'a@b.c', emailVerified: false }, onboarding: notOnboarded }),
      );

      const caught = await attempt('/dashboard');

      expect((caught as RedirectError).redirectOpts).toEqual({ to: '/verify-email-required' });
    });
  });
});
