import { describe, expect, it, vi } from 'vitest';
import { AiCreditService } from '#src/use-cases/plans/AiCreditService.js';
import { EntitlementService } from '#src/use-cases/plans/EntitlementService.js';
import { AiCreditsExhaustedError } from '#src/use-cases/errors/DomainError.js';
import { AI_CREDITS, AI_FEATURE, PLAN_LIMITS, PLAN_TRIAL } from '#src/use-cases/constants.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const NOW = new Date('2026-11-15T12:00:00.000Z');
const MONTH = new Date('2026-11-01T00:00:00.000Z');
const OLD_ACCOUNT = new Date('2026-01-01T00:00:00.000Z');
const DAY = 86_400_000;

function build(userOverrides = {}, { reserve = true, plansEnforced = true } = {}) {
  const user = makeUser({ createdAt: OLD_ACCOUNT, ...userOverrides });
  const userRepository = makeUserRepository({
    findById: vi.fn().mockResolvedValue(user),
    reserveAiCredits: vi.fn().mockResolvedValue(reserve),
  });
  const entitlementService = new EntitlementService({
    userRepository,
    plansEnforced,
    now: () => NOW,
  });
  const service = new AiCreditService({ userRepository, entitlementService, now: () => NOW });
  return { service, userRepository, user };
}

describe('AiCreditService.charge', () => {
  it('reserves the weight of the feature against the plan size for this UTC month', async () => {
    const { service, userRepository } = build();

    await service.charge('user-1', AI_FEATURE.COVER_LETTER);

    expect(userRepository.reserveAiCredits).toHaveBeenCalledWith(
      'user-1',
      AI_CREDITS.WEIGHTS.coverLetter,
      PLAN_LIMITS.free.aiCreditsPerMonth,
      MONTH,
    );
  });

  it('charges 3 for a resume and 1 for a chat turn', async () => {
    const { service, userRepository } = build();

    await service.charge('user-1', AI_FEATURE.RESUME);
    await service.charge('user-1', AI_FEATURE.CHAT);

    const weights = vi.mocked(userRepository.reserveAiCredits).mock.calls.map((c) => c[1]);
    expect(weights).toEqual([3, 1]);
  });

  it('charges nothing for a key test', async () => {
    const { service, userRepository } = build();

    expect(await service.charge('user-1', AI_FEATURE.KEY_TEST)).toBeNull();
    expect(userRepository.reserveAiCredits).not.toHaveBeenCalled();
  });

  it('adds the welcome bonus to the limit in the first 14 days', async () => {
    const { service, userRepository } = build({ createdAt: new Date(NOW.getTime() - 3 * DAY) });

    await service.charge('user-1', AI_FEATURE.CHAT);

    expect(userRepository.reserveAiCredits).toHaveBeenCalledWith(
      'user-1',
      1,
      PLAN_LIMITS.free.aiCreditsPerMonth + AI_CREDITS.WELCOME_BONUS,
      MONTH,
    );
  });

  it('drops the welcome bonus once the window has passed', async () => {
    const { service, userRepository } = build({
      createdAt: new Date(NOW.getTime() - AI_CREDITS.WELCOME_DAYS * DAY),
    });

    await service.charge('user-1', AI_FEATURE.CHAT);

    expect(vi.mocked(userRepository.reserveAiCredits).mock.calls[0]?.[2]).toBe(
      PLAN_LIMITS.free.aiCreditsPerMonth,
    );
  });

  it('uses the Pro size on Pro and the trial size on a trial', async () => {
    const pro = build({ plan: 'pro', planSource: 'subscription' });
    await pro.service.charge('user-1', AI_FEATURE.CHAT);
    expect(vi.mocked(pro.userRepository.reserveAiCredits).mock.calls[0]?.[2]).toBe(
      PLAN_LIMITS.pro.aiCreditsPerMonth,
    );

    const trial = build({
      plan: 'pro',
      planSource: 'trial',
      planExpiresAt: new Date(NOW.getTime() + DAY),
    });
    await trial.service.charge('user-1', AI_FEATURE.CHAT);
    expect(vi.mocked(trial.userRepository.reserveAiCredits).mock.calls[0]?.[2]).toBe(
      PLAN_TRIAL.AI_CREDITS,
    );
  });

  it('gives the Free size when plans are not enforced', async () => {
    const { service, userRepository } = build({ plan: 'free' }, { plansEnforced: false });

    await service.charge('user-1', AI_FEATURE.CHAT);

    expect(vi.mocked(userRepository.reserveAiCredits).mock.calls[0]?.[2]).toBe(
      PLAN_LIMITS.free.aiCreditsPerMonth,
    );
  });

  it('throws AI_CREDITS_EXHAUSTED with the limit and the reset date when refused', async () => {
    const { service } = build({}, { reserve: false });

    const err = await service.charge('user-1', AI_FEATURE.CHAT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiCreditsExhaustedError);
    expect(err).toMatchObject({
      code: 'AI_CREDITS_EXHAUSTED',
      limit: PLAN_LIMITS.free.aiCreditsPerMonth,
      resetsAt: new Date('2026-12-01T00:00:00.000Z'),
    });
    expect((err as Error).message).toBe(
      "You've used this month's AI credits. They reset on December 1, 2026. Upgrade to Pro or add your own API key to keep going.",
    );
  });

  it('refunds once, however many times it is asked', async () => {
    const { service, userRepository } = build();

    const charge = await service.charge('user-1', AI_FEATURE.COVER_LETTER);
    await charge!.refund();
    await charge!.refund();

    expect(userRepository.releaseAiCredits).toHaveBeenCalledTimes(1);
    expect(userRepository.releaseAiCredits).toHaveBeenCalledWith('user-1', 2, MONTH);
  });
});

describe('AiCreditService.standing', () => {
  it('reports this month usage against the plan size', () => {
    const { service, user } = build({ aiCreditsUsed: 12, aiCreditsPeriodStart: MONTH });

    expect(service.standing(user)).toEqual({
      used: 12,
      limit: PLAN_LIMITS.free.aiCreditsPerMonth,
      bonusRemaining: 0,
      resetsAt: new Date('2026-12-01T00:00:00.000Z'),
    });
  });

  it('reads a counter from an earlier month as zero', () => {
    const { service, user } = build({
      aiCreditsUsed: 30,
      aiCreditsPeriodStart: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(service.standing(user).used).toBe(0);
  });

  it('shows the full bonus while the plan size is not yet spent, and shrinks it after', () => {
    const createdAt = new Date(NOW.getTime() - DAY);
    const fresh = build({ createdAt, aiCreditsUsed: 10, aiCreditsPeriodStart: MONTH });
    expect(fresh.service.standing(fresh.user).bonusRemaining).toBe(AI_CREDITS.WELCOME_BONUS);

    const dipping = build({ createdAt, aiCreditsUsed: 35, aiCreditsPeriodStart: MONTH });
    expect(dipping.service.standing(dipping.user).bonusRemaining).toBe(15);

    const spent = build({ createdAt, aiCreditsUsed: 50, aiCreditsPeriodStart: MONTH });
    expect(spent.service.standing(spent.user).bonusRemaining).toBe(0);
  });
});
