import { describe, it, expect, vi } from 'vitest';
import { RequestAvatarUploadUrlUseCase } from '#src/use-cases/user/RequestAvatarUploadUrlUseCase.js';
import { makeStorageProvider } from '#src/__tests__/helpers/mocks/documents.js';

vi.mock('nanoid', () => ({ nanoid: vi.fn().mockReturnValue('fixed-nanoid') }));

describe('RequestAvatarUploadUrlUseCase', () => {
  it('throws VALIDATION when the mimeType is not an allowed image type', async () => {
    const storageProvider = makeStorageProvider();
    const useCase = new RequestAvatarUploadUrlUseCase({ storageProvider });

    const err = await useCase
      .execute({ userId: 'user-1', filename: 'me.pdf', mimeType: 'application/pdf' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(storageProvider.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('returns a presigned upload URL and the computed storage key', async () => {
    const storageProvider = makeStorageProvider({
      getPresignedUploadUrl: vi.fn().mockResolvedValue('https://r2.example.com/upload'),
    });
    const useCase = new RequestAvatarUploadUrlUseCase({ storageProvider });

    const result = await useCase.execute({
      userId: 'user-1',
      filename: 'me.png',
      mimeType: 'image/png',
    });

    expect(result.uploadUrl).toBe('https://r2.example.com/upload');
    expect(result.storageKey).toBe('users/user-1/avatar/fixed-nanoid-me.png');
    expect(storageProvider.getPresignedUploadUrl).toHaveBeenCalledWith(
      result.storageKey,
      'image/png',
    );
  });

  it('sanitizes the filename — replaces spaces and strips special characters', async () => {
    const storageProvider = makeStorageProvider({
      getPresignedUploadUrl: vi.fn().mockResolvedValue('https://r2.example.com/upload'),
    });
    const useCase = new RequestAvatarUploadUrlUseCase({ storageProvider });

    const result = await useCase.execute({
      userId: 'user-1',
      filename: 'my photo (final) v2.png',
      mimeType: 'image/png',
    });

    expect(result.storageKey).toMatch(/fixed-nanoid-my-photo-final-v2\.png$/);
  });
});
