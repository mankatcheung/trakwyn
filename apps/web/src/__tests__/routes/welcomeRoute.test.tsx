import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@tanstack/react-router';

const { mockCheckOnboarding } = vi.hoisted(() => ({ mockCheckOnboarding: vi.fn() }));

vi.mock('#/features/onboarding/graphql/onboardingQueries', () => ({
  checkOnboarding: mockCheckOnboarding,
}));
vi.mock('../../features/onboarding/pages/WelcomePage', () => ({ WelcomePage: () => null }));

async function loadGuard(): Promise<() => Promise<unknown>> {
  const mod = await import('#/routes/_authenticated/welcome');
  return (mod.Route as unknown as { options: { beforeLoad: () => Promise<unknown> } }).options
    .beforeLoad;
}

describe('/welcome route guard (JEF-460)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends someone who finished onboarding to the dashboard', async () => {
    mockCheckOnboarding.mockResolvedValue({ onboardingCompletedAt: '2026-11-01T00:00:00Z' });
    const guard = await loadGuard();

    const caught = await guard().catch((err: unknown) => err);

    expect(isRedirect(caught)).toBe(true);
    expect((caught as { options: { to: string } }).options.to).toBe('/dashboard');
  });

  it('lets the page render when onboarding is not complete', async () => {
    mockCheckOnboarding.mockResolvedValue({ onboardingCompletedAt: null });
    const guard = await loadGuard();

    await expect(guard()).resolves.toBeUndefined();
  });

  it('lets the page render when there is no onboarding state', async () => {
    mockCheckOnboarding.mockResolvedValue(null);
    const guard = await loadGuard();

    await expect(guard()).resolves.toBeUndefined();
  });
});
