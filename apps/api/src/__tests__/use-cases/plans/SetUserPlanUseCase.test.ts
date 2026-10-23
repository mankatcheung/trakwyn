import { describe, expect, it, vi } from 'vitest';
import { SetUserPlanUseCase } from '#src/use-cases/plans/SetUserPlanUseCase.js';
import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function build(found = makeUser({ id: 'user-1', email: 'a@b.com' })) {
  const userRepository = makeUserRepository({
    findByEmail: vi.fn().mockResolvedValue(found),
    update: vi
      .fn()
      .mockImplementation(async (_id: string, data: object) => ({ ...found, ...data })),
  });
  const useCase = new SetUserPlanUseCase({ userRepository, now: () => NOW });
  return { useCase, userRepository };
}

describe('SetUserPlanUseCase', () => {
  it('gives a user Pro with no end date as a grant', async () => {
    const { useCase, userRepository } = build();

    await useCase.execute({ email: 'a@b.com', plan: 'pro' });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      plan: 'pro',
      planSource: 'grant',
      planExpiresAt: null,
    });
  });

  it('ends a Pro grant after a number of days', async () => {
    const { useCase, userRepository } = build();

    await useCase.execute({ email: 'a@b.com', plan: 'pro', days: 30 });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      plan: 'pro',
      planSource: 'grant',
      planExpiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
    });
  });

  it('puts a user back on Free and clears the source and end date', async () => {
    const { useCase, userRepository } = build(
      makeUser({ id: 'user-1', plan: 'pro', planSource: 'grant' }),
    );

    await useCase.execute({ email: 'a@b.com', plan: 'free' });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      plan: 'free',
      planSource: null,
      planExpiresAt: null,
    });
  });

  it('returns what the user is now on', async () => {
    const { useCase } = build();

    const result = await useCase.execute({ email: 'a@b.com', plan: 'pro', days: 7 });

    expect(result).toEqual({
      userId: 'user-1',
      email: 'a@b.com',
      plan: 'pro',
      planSource: 'grant',
      planExpiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
    });
  });

  it('fails with NotFoundError for an unknown email', async () => {
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });
    const useCase = new SetUserPlanUseCase({ userRepository, now: () => NOW });

    await expect(useCase.execute({ email: 'nobody@b.com', plan: 'pro' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it.each([0, -5, 1.5, Number.NaN])('rejects %s days as a duration', async (days) => {
    const { useCase, userRepository } = build();

    await expect(useCase.execute({ email: 'a@b.com', plan: 'pro', days })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('rejects an end date on a Free plan, which has none', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({ email: 'a@b.com', plan: 'free', days: 30 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
