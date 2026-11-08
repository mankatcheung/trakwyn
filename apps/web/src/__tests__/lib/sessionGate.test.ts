import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockRequest } }));

import { queryClient } from '#/lib/queryClient';
import { EMAIL_VERIFICATION_KEY } from '#/lib/emailVerification';
import { ONBOARDING_STATE_KEY } from '#/lib/onboarding';
import { checkSessionGate, SESSION_GATE_QUERY } from '#/lib/sessionGate';

const ME = {
  email: 'a@b.c',
  emailVerified: true,
  deletionScheduledAt: null,
  onboardingCompletedAt: '2026-10-01T00:00:00.000Z',
  onboardingGoals: ['TRACK_APPLICATIONS'],
};

describe('checkSessionGate (JEF-535)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('answers verification and onboarding with one request', async () => {
    mockRequest.mockResolvedValue({ me: ME });

    const gate = await checkSessionGate();

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(SESSION_GATE_QUERY);
    expect(gate.verification).toEqual({
      email: 'a@b.c',
      emailVerified: true,
      deletionScheduledAt: null,
    });
    expect(gate.onboarding).toEqual({
      onboardingCompletedAt: ME.onboardingCompletedAt,
      onboardingGoals: ['TRACK_APPLICATIONS'],
    });
  });

  it('shares one request between guards running at the same moment', async () => {
    mockRequest.mockResolvedValue({ me: ME });

    const [first, second] = await Promise.all([checkSessionGate(), checkSessionGate()]);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('writes both caches, so the wall and the welcome page read the same answer', async () => {
    mockRequest.mockResolvedValue({ me: ME });

    await checkSessionGate();

    expect(queryClient.getQueryData(EMAIL_VERIFICATION_KEY)).toMatchObject({ emailVerified: true });
    expect(queryClient.getQueryData(ONBOARDING_STATE_KEY)).toMatchObject({
      onboardingCompletedAt: ME.onboardingCompletedAt,
    });
  });

  it('makes no request on later navigations once verified and onboarded', async () => {
    mockRequest.mockResolvedValue({ me: ME });
    await checkSessionGate();

    await checkSessionGate();

    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('asks again when the user is not yet verified and the answer is old', async () => {
    vi.useFakeTimers();
    try {
      mockRequest.mockResolvedValue({ me: { ...ME, emailVerified: false } });
      await checkSessionGate();

      vi.advanceTimersByTime(11_000);
      mockRequest.mockResolvedValue({ me: ME });
      const gate = await checkSessionGate();

      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(gate.verification?.emailVerified).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('trusts a recent unfinished answer, such as the welcome page having just written one', async () => {
    mockRequest.mockResolvedValue({ me: { ...ME, onboardingCompletedAt: null } });
    await checkSessionGate();
    queryClient.setQueryData(ONBOARDING_STATE_KEY, {
      onboardingCompletedAt: '2026-11-08T00:00:00.000Z',
      onboardingGoals: [],
    });

    const gate = await checkSessionGate();

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(gate.onboarding?.onboardingCompletedAt).toBe('2026-11-08T00:00:00.000Z');
  });

  it('is "let them in" for both checks when the request fails', async () => {
    mockRequest.mockRejectedValue(new Error('network'));

    await expect(checkSessionGate()).resolves.toEqual({ verification: null, onboarding: null });
  });

  it('is "let them in" when there is no signed-in user', async () => {
    mockRequest.mockResolvedValue({ me: null });

    await expect(checkSessionGate()).resolves.toEqual({ verification: null, onboarding: null });
  });
});
