import { describe, it, expect, vi } from 'vitest';
import { ConfirmAvatarUseCase } from '#src/use-cases/user/ConfirmAvatarUseCase.js';
import { makeStorageProvider } from '#src/__tests__/helpers/mocks/documents.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('ConfirmAvatarUseCase', () => {
  const input = {
    userId: 'user-1',
    storageKey: 'users/user-1/avatar/new-key.png',
    mimeType: 'image/png',
    sizeBytes: 12345,
  };

  it('throws VALIDATION when the mimeType is not an allowed image type', async () => {
    const userRepository = makeUserRepository();
    const useCase = new ConfirmAvatarUseCase({
      userRepository,
      storageProvider: makeStorageProvider(),
    });

    const err = await useCase.execute({ ...input, mimeType: 'application/pdf' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when sizeBytes is not positive', async () => {
    const userRepository = makeUserRepository();
    const useCase = new ConfirmAvatarUseCase({
      userRepository,
      storageProvider: makeStorageProvider(),
    });

    const err = await useCase.execute({ ...input, sizeBytes: -1 }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when sizeBytes exceeds the maximum allowed size', async () => {
    const userRepository = makeUserRepository();
    const useCase = new ConfirmAvatarUseCase({
      userRepository,
      storageProvider: makeStorageProvider(),
    });

    const err = await useCase.execute({ ...input, sizeBytes: 6 * 1024 * 1024 }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new ConfirmAvatarUseCase({
      userRepository,
      storageProvider: makeStorageProvider(),
    });

    const err = await useCase.execute(input).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('sets the new avatarKey on the user', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ avatarKey: null })),
    });
    const useCase = new ConfirmAvatarUseCase({
      userRepository,
      storageProvider: makeStorageProvider(),
    });

    await useCase.execute(input);

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      avatarKey: input.storageKey,
    });
  });

  it('deletes the previous avatar file when one existed', async () => {
    const userRepository = makeUserRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeUser({ avatarKey: 'users/user-1/avatar/old-key.png' })),
    });
    const storageProvider = makeStorageProvider();
    const useCase = new ConfirmAvatarUseCase({ userRepository, storageProvider });

    await useCase.execute(input);

    expect(storageProvider.delete).toHaveBeenCalledWith('users/user-1/avatar/old-key.png');
  });

  it('does not attempt to delete anything for a first-time avatar upload', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ avatarKey: null })),
    });
    const storageProvider = makeStorageProvider();
    const useCase = new ConfirmAvatarUseCase({ userRepository, storageProvider });

    await useCase.execute(input);

    expect(storageProvider.delete).not.toHaveBeenCalled();
  });
});
