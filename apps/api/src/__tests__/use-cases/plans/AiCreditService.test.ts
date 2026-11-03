import { describe, expect, it, vi } from 'vitest';
import { AiCreditService } from '#src/use-cases/plans/AiCreditService.js';
import { EntitlementService } from '#src/use-cases/plans/EntitlementService.js';
import { AiCreditsExhaustedError, PlanRequiredError } from '#src/use-cases/errors/DomainError.js';
import {
  AI_COST_CEILING_MICROS,
  AI_CREDITS,
  AI_FEATURE,
  PLAN_LIMITS,
  PLAN_TRIAL,
} from '#src/use-cases/constants.js';
import { makeLlmUsageEventRepository } from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const NOW = new Date('2026-11-15T12:00:00.000Z');
const MONTH = new Date('2026-11-01T00:00:00.000Z');
const OLD_ACCOUNT = new Date('2026-01-01T00:00:00.000Z');
const DAY = 86_400_000;

function build(
  userOverrides = {},
  { reserve = true, plansEnforced = true, spent = 0 as number | Error } = {},
) {
  // Hosted AI is Pro-only for now (JEF-451), so a built user is on Pro unless a test says otherwise.
  const user = makeUser({
    createdAt: OLD_ACCOUNT,
    plan: 'pro',
    planSource: 'subscription',
    planExpiresAt: null,
    ...userOverrides,
  });
  const userRepository = makeUserRepository({
    findById: vi.fn().mockResolvedValue(user),
    reserveAiCredits: vi.fn().mockResolvedValue(reserve),
  });
  const llmUsageEventRepository = makeLlmUsageEventRepository({
    sumCostMicros:
      spent instanceof Error ? vi.fn().mockRejectedValue(spent) : vi.fn().mockResolvedValue(spent),
  });
  const entitlementService = new EntitlementService({
    userRepository,
    plansEnforced,
    now: () => NOW,
  });
  const service = new AiCreditService({
    userRepository,
    entitlementService,
    llmUsageEventRepository,
    now: () => NOW,
  });
  return { service, userRepository, user, llmUsageEventRepository };
}

describe('AiCreditService.charge', () => {
  it('reserves the weight of the feature against the plan size for this UTC month', async () => {
    const { service, userRepository } = build();

    await service.charge('user-1', AI_FEATURE.COVER_LETTER);

    expect(userRepository.reserveAiCredits).toHaveBeenCalledWith(
      'user-1',
      AI_CREDITS.WEIGHTS.coverLetter,
      PLAN_LIMITS.pro.aiCreditsPerMonth,
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
      PLAN_LIMITS.pro.aiCreditsPerMonth + AI_CREDITS.WELCOME_BONUS,
      MONTH,
    );
  });

  it('drops the welcome bonus once the window has passed', async () => {
    const { service, userRepository } = build({
      createdAt: new Date(NOW.getTime() - AI_CREDITS.WELCOME_DAYS * DAY),
    });

    await service.charge('user-1', AI_FEATURE.CHAT);

    expect(vi.mocked(userRepository.reserveAiCredits).mock.calls[0]?.[2]).toBe(
      PLAN_LIMITS.pro.aiCreditsPerMonth,
    );
  });

  it('uses the Pro size on Pro and the trial size on a trial', async () => {
    const pro = build();
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

  it('gives a Free user no credits, and no welcome bonus, with plans enforced or not', async () => {
    for (const plansEnforced of [true, false]) {
      const { service, userRepository } = build(
        { plan: 'free', planSource: null, createdAt: new Date(NOW.getTime() - DAY) },
        { plansEnforced },
      );

      const err = await service.charge('user-1', AI_FEATURE.CHAT).catch((e: unknown) => e);

      expect(PLAN_LIMITS.free.aiCreditsPerMonth).toBe(0);
      expect(err).toBeInstanceOf(PlanRequiredError);
      expect(err).toMatchObject({ code: 'PLAN_REQUIRED' });
      expect(userRepository.reserveAiCredits).not.toHaveBeenCalled();
    }
  });

  it('past the credits a Pro user is refused only at the fair-use ceiling', async () => {
    const { service } = build({}, { reserve: false, spent: AI_COST_CEILING_MICROS.pro });

    const err = await service.charge('user-1', AI_FEATURE.CHAT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiCreditsExhaustedError);
    expect(err).toMatchObject({
      code: 'AI_CREDITS_EXHAUSTED',
      limit: PLAN_LIMITS.pro.aiCreditsPerMonth,
      resetsAt: new Date('2026-12-01T00:00:00.000Z'),
    });
  });

  /**
   * Free has no credits, so this message is unreachable from the service until
   * Free credits come back (the follow-up to JEF-451); its text stays pinned.
   */
  it('words the credits-used-up error for a plan whose credits have run out', () => {
    const err = new AiCreditsExhaustedError(30, new Date('2026-12-01T00:00:00.000Z'));

    expect(err.message).toBe(
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
      limit: PLAN_LIMITS.pro.aiCreditsPerMonth,
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
    const size = PLAN_LIMITS.pro.aiCreditsPerMonth;
    const fresh = build({ createdAt, aiCreditsUsed: 10, aiCreditsPeriodStart: MONTH });
    expect(fresh.service.standing(fresh.user).bonusRemaining).toBe(AI_CREDITS.WELCOME_BONUS);

    const dipping = build({ createdAt, aiCreditsUsed: size + 5, aiCreditsPeriodStart: MONTH });
    expect(dipping.service.standing(dipping.user).bonusRemaining).toBe(
      AI_CREDITS.WELCOME_BONUS - 5,
    );

    const spent = build({
      createdAt,
      aiCreditsUsed: size + AI_CREDITS.WELCOME_BONUS,
      aiCreditsPeriodStart: MONTH,
    });
    expect(spent.service.standing(spent.user).bonusRemaining).toBe(0);

    const free = build({ plan: 'free', planSource: null, createdAt });
    expect(free.service.standing(free.user)).toMatchObject({ limit: 0, bonusRemaining: 0 });
  });
});

describe('AiCreditService.charge past the credit limit (JEF-448)', () => {
  const PRO = { plan: 'pro' as const, planExpiresAt: null, planSource: 'subscription' as const };

  it('refuses a Free user with an upgrade prompt, without reading cost', async () => {
    const { service, llmUsageEventRepository } = build(
      { plan: 'free', planSource: null },
      { reserve: false },
    );

    await expect(service.charge('user-1', AI_FEATURE.CHAT)).rejects.toBeInstanceOf(
      PlanRequiredError,
    );
    expect(llmUsageEventRepository.sumCostMicros).not.toHaveBeenCalled();
  });

  it('lets a Pro user through as overflow, taking nothing, while under the ceiling', async () => {
    const { service, llmUsageEventRepository } = build(PRO, { reserve: false, spent: 1_499_999 });

    const charge = await service.charge('user-1', AI_FEATURE.COVER_LETTER);

    expect(charge?.overflow).toBe(true);
    await expect(charge?.refund()).resolves.toBeUndefined();
    expect(llmUsageEventRepository.sumCostMicros).toHaveBeenCalledWith('user-1', MONTH, 'platform');
  });

  it('refuses a Pro user at the ceiling with the fair-use message', async () => {
    const { service } = build(PRO, { reserve: false, spent: AI_COST_CEILING_MICROS.pro });

    const err = await service.charge('user-1', AI_FEATURE.CHAT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiCreditsExhaustedError);
    expect((err as AiCreditsExhaustedError).message).toContain('fair-use limit');
    expect((err as AiCreditsExhaustedError).message).not.toContain('$');
  });

  it('does not flag overflow while credits remain', async () => {
    const { service, llmUsageEventRepository } = build(PRO, { reserve: true });

    const charge = await service.charge('user-1', AI_FEATURE.CHAT);

    expect(charge?.overflow).toBeUndefined();
    expect(llmUsageEventRepository.sumCostMicros).not.toHaveBeenCalled();
  });

  it('fails closed when the cost cannot be read', async () => {
    const { service } = build(PRO, { reserve: false, spent: new Error('db down') });

    await expect(service.charge('user-1', AI_FEATURE.CHAT)).rejects.toThrow('db down');
  });

  it('treats an expired Pro plan as Free', async () => {
    const { service, llmUsageEventRepository } = build(
      { ...PRO, planExpiresAt: new Date('2026-11-01T00:00:00.000Z') },
      { reserve: false },
    );

    await expect(service.charge('user-1', AI_FEATURE.CHAT)).rejects.toBeInstanceOf(
      PlanRequiredError,
    );
    expect(llmUsageEventRepository.sumCostMicros).not.toHaveBeenCalled();
  });
});
