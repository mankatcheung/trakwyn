import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateProfileUseCase } from '#src/use-cases/user/UpdateProfileUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('UpdateProfileUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const err = await new UpdateProfileUseCase({ userRepository })
      .execute({ userId: 'missing', name: 'Jeff' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('updates name, timezone, targetRole, and customAiPrompt together', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    await new UpdateProfileUseCase({ userRepository }).execute({
      userId: 'user-1',
      name: '  Jeff Man  ',
      timezone: 'America/Los_Angeles',
      targetRole: '  Staff Engineer  ',
      customAiPrompt: '  Keep it casual and under 200 words.  ',
    });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      name: 'Jeff Man',
      timezone: 'America/Los_Angeles',
      targetRole: 'Staff Engineer',
      customAiPrompt: 'Keep it casual and under 200 words.',
      useCrossApplicationContext: undefined,
    });
  });

  it('leaves fields untouched when undefined', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    await new UpdateProfileUseCase({ userRepository }).execute({ userId: 'user-1', name: 'Jeff' });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      name: 'Jeff',
      timezone: undefined,
      targetRole: undefined,
      customAiPrompt: undefined,
      useCrossApplicationContext: undefined,
    });
  });

  it('passes useCrossApplicationContext straight through, on or off', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    await new UpdateProfileUseCase({ userRepository }).execute({
      userId: 'user-1',
      useCrossApplicationContext: true,
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ useCrossApplicationContext: true }),
    );
  });

  it('clears a field when given an empty or whitespace-only string', async () => {
    const user = makeUser({ id: 'user-1', name: 'Old Name' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    await new UpdateProfileUseCase({ userRepository }).execute({
      userId: 'user-1',
      name: '   ',
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: null }),
    );
  });

  it('clears a field when explicitly given null', async () => {
    const user = makeUser({ id: 'user-1', targetRole: 'Engineer' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    await new UpdateProfileUseCase({ userRepository }).execute({
      userId: 'user-1',
      targetRole: null,
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ targetRole: null }),
    );
  });

  it('throws VALIDATION for an invalid IANA timezone', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const err = await new UpdateProfileUseCase({ userRepository })
      .execute({ userId: 'user-1', timezone: 'Not/A_Timezone' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('accepts the UTC timezone', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    await new UpdateProfileUseCase({ userRepository }).execute({
      userId: 'user-1',
      timezone: 'UTC',
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ timezone: 'UTC' }),
    );
  });

  it('throws VALIDATION when name exceeds the max length', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const err = await new UpdateProfileUseCase({ userRepository })
      .execute({ userId: 'user-1', name: 'a'.repeat(101) })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when targetRole exceeds the max length', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const err = await new UpdateProfileUseCase({ userRepository })
      .execute({ userId: 'user-1', targetRole: 'a'.repeat(101) })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('clears customAiPrompt when given an empty or whitespace-only string', async () => {
    const user = makeUser({ id: 'user-1', customAiPrompt: 'Old instructions' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    await new UpdateProfileUseCase({ userRepository }).execute({
      userId: 'user-1',
      customAiPrompt: '   ',
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ customAiPrompt: null }),
    );
  });

  describe('a saved AI provider order (JEF-503)', () => {
    it('clears it when an older app turns fall-through on or off, since that setting is then the one in force', async () => {
      const user = makeUser({ id: 'user-1' });
      const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

      await new UpdateProfileUseCase({ userRepository }).execute({
        userId: 'user-1',
        llmFallbackWhenLimited: true,
      });

      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ llmFallbackWhenLimited: true, aiProviderOrder: null }),
      );
    });

    it('leaves it alone on an unrelated profile edit', async () => {
      const user = makeUser({ id: 'user-1' });
      const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

      await new UpdateProfileUseCase({ userRepository }).execute({
        userId: 'user-1',
        name: 'Jeff',
      });

      const [, data] = vi.mocked(userRepository.update).mock.calls[0];
      expect(data).not.toHaveProperty('aiProviderOrder');
    });
  });

  it('throws VALIDATION when customAiPrompt exceeds the max length', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const err = await new UpdateProfileUseCase({ userRepository })
      .execute({ userId: 'user-1', customAiPrompt: 'a'.repeat(501) })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  describe('contact details (JEF-527)', () => {
    const setup = () => {
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
      });
      return { userRepository, useCase: new UpdateProfileUseCase({ userRepository }) };
    };

    it('saves phone, location and links, trimmed', async () => {
      const { userRepository, useCase } = setup();

      await useCase.execute({
        userId: 'user-1',
        phone: ' +44 20 7946 0958 ',
        location: ' London ',
        profileLinks: [' https://linkedin.com/in/ada '],
      });

      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          phone: '+44 20 7946 0958',
          location: 'London',
          profileLinks: ['https://linkedin.com/in/ada'],
        }),
      );
    });

    it('clears them with blank values and an empty list', async () => {
      const { userRepository, useCase } = setup();

      await useCase.execute({ userId: 'user-1', phone: '', location: null, profileLinks: [] });

      expect(userRepository.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ phone: null, location: null, profileLinks: null }),
      );
    });

    it('leaves them alone when not sent', async () => {
      const { userRepository, useCase } = setup();

      await useCase.execute({ userId: 'user-1', name: 'Ada' });

      const data = vi.mocked(userRepository.update).mock.calls[0]![1];
      expect(data.phone).toBeUndefined();
      expect(data.location).toBeUndefined();
      expect(data.profileLinks).toBeUndefined();
    });

    it.each([
      [{ phone: 'call me' }, /digits/],
      [{ phone: '1'.repeat(31) }, /at most 30/],
      [{ location: 'x'.repeat(101) }, /at most 100/],
      [{ profileLinks: ['not a url'] }, /not a valid/],
      [
        { profileLinks: ['https://a.dev', 'https://b.dev', 'https://c.dev', 'https://d.dev'] },
        /at most 3/,
      ],
    ])('rejects %j with a clear message and writes nothing', async (patch, message) => {
      const { userRepository, useCase } = setup();

      const err = await useCase.execute({ userId: 'user-1', ...patch }).catch((e) => e);

      expect((err as { code: string }).code).toBe('VALIDATION');
      expect((err as Error).message).toMatch(message);
      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });
});
