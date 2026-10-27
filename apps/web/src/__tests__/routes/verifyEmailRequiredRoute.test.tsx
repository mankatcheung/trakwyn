import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHasSessionCookie, mockCheckEmailVerification } = vi.hoisted(() => ({
  mockHasSessionCookie: vi.fn().mockReturnValue(true),
  mockCheckEmailVerification: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  hasSessionCookie: mockHasSessionCookie,
  gqlClient: {},
}));

vi.mock('#/lib/emailVerification', () => ({
  checkEmailVerification: mockCheckEmailVerification,
  useEmailVerification: vi.fn(),
}));

// The page is covered by VerifyEmailRequiredPage.test.tsx; the guard is what's
// under test here.
vi.mock('#/routes/-components/VerifyEmailRequiredPage', () => ({
  VerifyEmailRequiredPage: () => null,
}));

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

async function runGuard(): Promise<RedirectError | undefined> {
  const mod = await import('#/routes/verify-email-required');
  const { beforeLoad } =
    (mod.Route as unknown as { options?: { beforeLoad?: () => Promise<void> } }).options ??
    (mod.Route as unknown as { beforeLoad: () => Promise<void> });
  try {
    await beforeLoad!();
  } catch (err) {
    return err as RedirectError;
  }
  return undefined;
}

describe('/verify-email-required guard (JEF-438)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSessionCookie.mockReturnValue(true);
    mockCheckEmailVerification.mockResolvedValue({
      email: 'new@example.com',
      emailVerified: false,
    });
  });

  it('shows the reminder to a signed-in, unverified user', async () => {
    expect(await runGuard()).toBeUndefined();
  });

  it('sends a signed-out visitor to /login', async () => {
    mockHasSessionCookie.mockReturnValue(false);

    expect((await runGuard())?.redirectOpts).toEqual({ to: '/login' });
    expect(mockCheckEmailVerification).not.toHaveBeenCalled();
  });

  it('sends a verified user to the app, so the page cannot be used as a dead end', async () => {
    mockCheckEmailVerification.mockResolvedValue({ email: 'a@b.c', emailVerified: true });

    expect((await runGuard())?.redirectOpts).toEqual({ to: '/dashboard' });
  });

  it('sends the user to the app when the check could not be made', async () => {
    mockCheckEmailVerification.mockResolvedValue(null);

    expect((await runGuard())?.redirectOpts).toEqual({ to: '/dashboard' });
  });
});
