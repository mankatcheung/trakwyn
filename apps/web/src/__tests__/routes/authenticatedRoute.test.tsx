import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHasSessionCookie, mockCheckEmailVerification, mockCheckOnboarding } = vi.hoisted(
  () => ({
    mockHasSessionCookie: vi.fn().mockReturnValue(false),
    mockCheckEmailVerification: vi.fn(),
    mockCheckOnboarding: vi.fn(),
  }),
);

vi.mock('#/lib/emailVerification', () => ({
  checkEmailVerification: mockCheckEmailVerification,
}));

// Only the network read is replaced; which paths are exempt is the real rule.
vi.mock('#/lib/onboarding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/onboarding')>()),
  checkOnboarding: mockCheckOnboarding,
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

describe('_authenticated route guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSessionCookie.mockReturnValue(false);
    mockCheckEmailVerification.mockResolvedValue({ email: 'a@b.c', emailVerified: true });
    mockCheckOnboarding.mockResolvedValue({
      onboardingCompletedAt: '2026-10-01T00:00:00.000Z',
      onboardingGoals: [],
    });
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
      mockCheckEmailVerification.mockResolvedValue({
        email: 'new@example.com',
        emailVerified: false,
      });
      const guard = await loadGuard();

      const caught = await Promise.resolve(guard({ location: { href: '/dashboard' } })).catch(
        (err: RedirectError) => err,
      );

      expect((caught as RedirectError).redirectOpts).toEqual({ to: '/verify-email-required' });
    });

    it('lets the visitor through when the check could not be made (the API still enforces the wall)', async () => {
      mockHasSessionCookie.mockReturnValue(true);
      mockCheckEmailVerification.mockResolvedValue(null);
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

      expect(mockCheckEmailVerification).not.toHaveBeenCalled();
    });
  });

  describe('first-run welcome flow (JEF-460)', () => {
    const notOnboarded = { onboardingCompletedAt: null, onboardingGoals: [] };

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
      mockCheckOnboarding.mockResolvedValue(notOnboarded);

      const caught = await attempt('/dashboard');

      expect((caught as RedirectError).redirectOpts).toEqual({ to: '/welcome' });
    });

    it('lets a user who has finished or skipped it through', async () => {
      await expect(attempt('/dashboard')).resolves.toBeUndefined();
    });

    it.each(['/welcome', '/settings', '/settings/ai', '/profile', '/oauth/consent'])(
      'leaves %s alone, so the flow and the pages it links to load',
      async (pathname) => {
        mockCheckOnboarding.mockResolvedValue(notOnboarded);

        await expect(attempt(pathname)).resolves.toBeUndefined();
      },
    );

    it('does not treat a path that only starts with an exempt word as exempt', async () => {
      mockCheckOnboarding.mockResolvedValue(notOnboarded);

      const caught = await attempt('/settingsfoo');

      expect((caught as RedirectError).redirectOpts).toEqual({ to: '/welcome' });
    });

    it('lets the user through when the check could not be made', async () => {
      mockCheckOnboarding.mockResolvedValue(null);

      await expect(attempt('/dashboard')).resolves.toBeUndefined();
    });

    it('asks only once the email wall is passed, so an unverified user goes to the wall', async () => {
      mockCheckEmailVerification.mockResolvedValue({ email: 'a@b.c', emailVerified: false });
      mockCheckOnboarding.mockResolvedValue(notOnboarded);

      const caught = await attempt('/dashboard');

      expect((caught as RedirectError).redirectOpts).toEqual({ to: '/verify-email-required' });
      expect(mockCheckOnboarding).not.toHaveBeenCalled();
    });
  });
});
