import { describe, expect, it, vi } from 'vitest';
import { BackfillEmailVerificationUseCase } from '#src/use-cases/auth/BackfillEmailVerificationUseCase.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const CUTOFF = new Date('2026-11-01T00:00:00.000Z');

const before = (days: number) => new Date(CUTOFF.getTime() - days * 86_400_000);
const after = (days: number) => new Date(CUTOFF.getTime() + days * 86_400_000);

function build(users: ReturnType<typeof makeUser>[]) {
  const userRepository = makeUserRepository({
    findAll: vi.fn().mockResolvedValue(users),
    update: vi.fn().mockResolvedValue(undefined),
  });
  return {
    useCase: new BackfillEmailVerificationUseCase({ userRepository, now: () => NOW }),
    userRepository,
  };
}

describe('BackfillEmailVerificationUseCase (JEF-438)', () => {
  it('marks unverified accounts created before the cutoff as verified, now', async () => {
    const { useCase, userRepository } = build([
      makeUser({ id: 'old-1', createdAt: before(30) }),
      makeUser({ id: 'old-2', createdAt: before(1) }),
    ]);

    const summary = await useCase.execute({ before: CUTOFF });

    expect(userRepository.update).toHaveBeenCalledWith('old-1', { emailVerifiedAt: NOW });
    expect(userRepository.update).toHaveBeenCalledWith('old-2', { emailVerifiedAt: NOW });
    expect(summary).toEqual({ verified: 2, alreadyVerified: 0, remaining: 0 });
  });

  it('leaves accounts created on or after the cutoff, and counts them as remaining', async () => {
    const { useCase, userRepository } = build([
      makeUser({ id: 'at', createdAt: CUTOFF }),
      makeUser({ id: 'new', createdAt: after(3) }),
    ]);

    const summary = await useCase.execute({ before: CUTOFF });

    expect(userRepository.update).not.toHaveBeenCalled();
    expect(summary).toEqual({ verified: 0, alreadyVerified: 0, remaining: 2 });
  });

  it('skips accounts that are already verified, so a second run changes nothing', async () => {
    const verifiedAt = new Date('2026-10-01T00:00:00.000Z');
    const { useCase, userRepository } = build([
      makeUser({ id: 'done', createdAt: before(30), emailVerifiedAt: verifiedAt }),
    ]);

    const summary = await useCase.execute({ before: CUTOFF });

    expect(userRepository.update).not.toHaveBeenCalled();
    expect(summary).toEqual({ verified: 0, alreadyVerified: 1, remaining: 0 });
  });

  it('counts what it would do without changing anyone on a dry run', async () => {
    const { useCase, userRepository } = build([
      makeUser({ id: 'old', createdAt: before(5) }),
      makeUser({ id: 'new', createdAt: after(5) }),
    ]);

    const summary = await useCase.execute({ before: CUTOFF, dryRun: true });

    expect(userRepository.update).not.toHaveBeenCalled();
    expect(summary).toEqual({ verified: 1, alreadyVerified: 0, remaining: 1 });
  });

  it('refuses a cutoff that is not a real date', async () => {
    const { useCase, userRepository } = build([makeUser({ createdAt: before(5) })]);

    await expect(useCase.execute({ before: new Date('nope') })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(userRepository.update).not.toHaveBeenCalled();
  });
});
