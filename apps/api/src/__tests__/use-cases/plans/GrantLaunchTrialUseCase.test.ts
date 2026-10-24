import { describe, expect, it, vi } from 'vitest';
import { GrantLaunchTrialUseCase } from '#src/use-cases/plans/GrantLaunchTrialUseCase.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { PLAN_TRIAL } from '#src/use-cases/constants.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function build(users = [makeUser({ id: 'u1' }), makeUser({ id: 'u2' })]) {
  const userRepository = makeUserRepository({
    findAll: vi.fn().mockResolvedValue(users),
    update: vi.fn().mockResolvedValue(undefined),
  });
  const useCase = new GrantLaunchTrialUseCase({ userRepository, now: () => NOW });
  return { useCase, userRepository };
}

describe('GrantLaunchTrialUseCase', () => {
  it('gives every Free user a Pro trial for the launch period by default', async () => {
    const { useCase, userRepository } = build();

    const summary = await useCase.execute({});

    const expires = new Date(NOW.getTime() + PLAN_TRIAL.LAUNCH_DAYS * DAY_MS);
    expect(userRepository.update).toHaveBeenCalledTimes(2);
    expect(userRepository.update).toHaveBeenCalledWith('u1', {
      plan: 'pro',
      planSource: 'trial',
      planExpiresAt: expires,
    });
    expect(summary).toEqual({ granted: 2, skipped: 0, endsAt: expires });
  });

  it('uses the number of days it is given', async () => {
    const { useCase, userRepository } = build([makeUser({ id: 'u1' })]);

    await useCase.execute({ days: 14 });

    expect(userRepository.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ planExpiresAt: new Date(NOW.getTime() + 14 * DAY_MS) }),
    );
  });

  it('leaves a user who is already on Pro alone', async () => {
    const { useCase, userRepository } = build([
      makeUser({ id: 'paid', plan: 'pro', planSource: 'subscription', planExpiresAt: null }),
    ]);

    const summary = await useCase.execute({});

    expect(userRepository.update).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
  });

  it('skips anyone who has had a plan before, so running it twice grants nothing twice', async () => {
    const { useCase, userRepository } = build([
      makeUser({
        id: 'was-trial',
        plan: 'pro',
        planSource: 'trial',
        planExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
      makeUser({ id: 'lapsed-pass', plan: 'pro', planSource: 'pass' }),
      makeUser({ id: 'new' }),
    ]);

    const summary = await useCase.execute({});

    expect(userRepository.update).toHaveBeenCalledTimes(1);
    expect(userRepository.update).toHaveBeenCalledWith('new', expect.any(Object));
    expect(summary).toMatchObject({ granted: 1, skipped: 2 });
  });

  it('reports a dry run without changing anyone', async () => {
    const { useCase, userRepository } = build();

    const summary = await useCase.execute({ dryRun: true });

    expect(userRepository.update).not.toHaveBeenCalled();
    expect(summary.granted).toBe(2);
  });

  it.each([0, -1, 2.5])('rejects %s days', async (days) => {
    const { useCase } = build();

    await expect(useCase.execute({ days })).rejects.toBeInstanceOf(ValidationError);
  });
});
