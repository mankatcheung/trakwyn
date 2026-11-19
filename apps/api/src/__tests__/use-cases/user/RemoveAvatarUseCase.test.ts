import { describe, it, expect, vi } from 'vitest';
import { RemoveAvatarUseCase } from '#src/use-cases/user/RemoveAvatarUseCase.js';
import { makeStorageProvider } from '#src/__tests__/helpers/mocks/documents.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('RemoveAvatarUseCase', () => {
  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new RemoveAvatarUseCase({
      userRepository,
      storageProvider: makeStorageProvider(),
    });

    const err = await useCase.execute('user-1').catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('deletes the file and clears avatarKey when an avatar exists', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ avatarKey: 'users/user-1/avatar/key.png' })),
    });
    const storageProvider = makeStorageProvider();
    const useCase = new RemoveAvatarUseCase({ userRepository, storageProvider });

    await useCase.execute('user-1');

    expect(storageProvider.delete).toHaveBeenCalledWith('users/user-1/avatar/key.png');
    expect(userRepository.update).toHaveBeenCalledWith('user-1', { avatarKey: null });
  });

  it('is a no-op when the user has no avatar (idempotent)', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ avatarKey: null })),
    });
    const storageProvider = makeStorageProvider();
    const useCase = new RemoveAvatarUseCase({ userRepository, storageProvider });

    await useCase.execute('user-1');

    expect(storageProvider.delete).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
  });
});
