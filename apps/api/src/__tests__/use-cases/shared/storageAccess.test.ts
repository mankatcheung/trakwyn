import { describe, it, expect, vi } from 'vitest';
import { storageAccessFor } from '#src/use-cases/shared/storageAccess.js';
import { RequestAvatarUploadUrlUseCase } from '#src/use-cases/user/RequestAvatarUploadUrlUseCase.js';
import { RequestUploadUrlUseCase } from '#src/use-cases/documents/RequestUploadUrlUseCase.js';
import { makeStorageProvider } from '#src/__tests__/helpers/mocks/documents.js';

describe('storageAccessFor', () => {
  it('keeps an avatar public', () => {
    expect(storageAccessFor('users/user-1/avatar/abc-me.png')).toBe('public');
  });

  it.each([
    ['an uploaded document', 'users/user-1/applications/app-1/abc-resume.pdf'],
    ['an exported PDF', 'documents/app-1/doc-1.pdf'],
    ['a key no feature uses yet', 'something/new/file.bin'],
    ['an empty key', ''],
  ])('makes %s private', (_label, key) => {
    expect(storageAccessFor(key)).toBe('private');
  });

  it.each([
    ['a different directory that only contains the word', 'users/user-1/applications/avatar/x.png'],
    ['an avatar path that is not under a user', 'avatar/x.png'],
    ['an avatar path with no user id', 'users//avatar/x.png'],
    ['a user whose key merely starts with avatar', 'users/user-1/avatars/x.png'],
    ['a traversal out of an avatar path', '../users/user-1/avatar/x.png'],
  ])('does not mistake %s for an avatar', (_label, key) => {
    expect(storageAccessFor(key)).toBe('private');
  });

  // The policy and the keys the use cases build are written in different
  // files; if either changes without the other, a document could be public or
  // an avatar private. These pin them together.
  describe('agrees with the keys the use cases build', () => {
    it('avatar upload keys are public', async () => {
      const storageProvider = makeStorageProvider({
        getPresignedUploadUrl: vi.fn().mockResolvedValue('token'),
      });
      const useCase = new RequestAvatarUploadUrlUseCase({ storageProvider });

      const result = await useCase.execute({
        userId: 'user-1',
        filename: 'me.png',
        mimeType: 'image/png',
      });

      expect(result.access).toBe('public');
      expect(storageAccessFor(result.storageKey)).toBe('public');
    });

    it('document upload keys are private', async () => {
      const storageProvider = makeStorageProvider({
        getPresignedUploadUrl: vi.fn().mockResolvedValue('token'),
      });
      const useCase = new RequestUploadUrlUseCase({
        applicationRepository: {
          findById: vi.fn().mockResolvedValue({ id: 'app-1', userId: 'user-1' }),
        },
        documentRepository: { countByApplicationId: vi.fn().mockResolvedValue(0) },
        storageProvider,
      } as never);

      const result = await useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
      });

      expect(result.access).toBe('private');
      expect(storageAccessFor(result.storageKey)).toBe('private');
    });
  });
});
