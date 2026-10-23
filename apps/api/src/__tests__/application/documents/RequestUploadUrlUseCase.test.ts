import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestUploadUrlUseCase } from '#src/use-cases/documents/RequestUploadUrlUseCase.js';
import {
  makeDocumentRepository,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

vi.mock('nanoid', () => ({ nanoid: vi.fn().mockReturnValue('fixed-nanoid') }));

describe('RequestUploadUrlUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new RequestUploadUrlUseCase({
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      userRepository: makeUserRepository(),
      storageProvider: makeStorageProvider(),
    });
    const err = await useCase
      .execute({
        userId: 'user-1',
        applicationId: 'app-missing',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to another user', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new RequestUploadUrlUseCase({
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      userRepository: makeUserRepository(),
      storageProvider: makeStorageProvider(),
    });
    const err = await useCase
      .execute({
        userId: 'user-1',
        applicationId: 'app-1',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('returns a presigned upload URL and the computed storage key', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const storageProvider = makeStorageProvider({
      getPresignedUploadUrl: vi.fn().mockResolvedValue('https://r2.example.com/upload'),
    });

    const useCase = new RequestUploadUrlUseCase({
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      userRepository: makeUserRepository(),
      storageProvider,
    });
    const result = await useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      filename: 'resume.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.uploadUrl).toBe('https://r2.example.com/upload');
    expect(result.storageKey).toBe('users/user-1/applications/app-1/fixed-nanoid-resume.pdf');
    expect(storageProvider.getPresignedUploadUrl).toHaveBeenCalledWith(
      result.storageKey,
      'application/pdf',
    );
  });

  it('rejects an upload URL request when the application has reached its document limit', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const documentRepository = makeDocumentRepository({
      countByApplicationId: vi.fn().mockResolvedValue(10),
    });
    const storageProvider = makeStorageProvider();

    const useCase = new RequestUploadUrlUseCase({
      applicationRepository,
      documentRepository,
      userRepository: makeUserRepository(),
      storageProvider,
    });
    const err = await useCase
      .execute({
        userId: 'user-1',
        applicationId: 'app-1',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('QUOTA_EXCEEDED');
    expect(storageProvider.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when the mimeType is not allowed', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });

    const useCase = new RequestUploadUrlUseCase({
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      userRepository: makeUserRepository(),
      storageProvider: makeStorageProvider(),
    });
    const err = await useCase
      .execute({
        userId: 'user-1',
        applicationId: 'app-1',
        filename: 'malware.exe',
        mimeType: 'application/x-msdownload',
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(applicationRepository.findById).not.toHaveBeenCalled();
  });

  it('sanitizes the filename — replaces spaces and strips special characters', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const storageProvider = makeStorageProvider({
      getPresignedUploadUrl: vi.fn().mockResolvedValue('https://r2.example.com/upload'),
    });

    const useCase = new RequestUploadUrlUseCase({
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      userRepository: makeUserRepository(),
      storageProvider,
    });
    const result = await useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      filename: 'my résumé (final) v2.pdf',
      mimeType: 'application/pdf',
    });

    // spaces → hyphens, accented chars and parens stripped
    expect(result.storageKey).toMatch(/fixed-nanoid-my-rsum-final-v2\.pdf$/);
  });
  describe('storage limit (JEF-425)', () => {
    const request = (sizeBytes: number | undefined, documentBytes: number) => {
      const storageProvider = makeStorageProvider({
        getPresignedUploadUrl: vi.fn().mockResolvedValue('https://upload.example.com/x'),
      });
      const useCase = new RequestUploadUrlUseCase({
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
        }),
        documentRepository: makeDocumentRepository(),
        userRepository: makeUserRepository({
          findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1', documentBytes })),
        }),
        storageProvider,
      });
      const result = useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes,
      });
      return { result, storageProvider };
    };

    it('refuses before issuing an upload URL when the file would not fit', async () => {
      const { result, storageProvider } = request(
        2_000_000,
        CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES - 1_000_000,
      );

      const err = await result.catch((e) => e);

      expect((err as { code: string }).code).toBe('QUOTA_EXCEEDED');
      expect((err as Error).message).toContain('of 100 MB used');
      expect(storageProvider.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('allows a file that exactly fills the remaining space', async () => {
      const { result } = request(
        1_000_000,
        CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES - 1_000_000,
      );

      await expect(result).resolves.toMatchObject({ uploadUrl: 'https://upload.example.com/x' });
    });

    it('still works for clients that send no size', async () => {
      const { result } = request(undefined, CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES);

      await expect(result).resolves.toMatchObject({ uploadUrl: 'https://upload.example.com/x' });
    });
  });
});
