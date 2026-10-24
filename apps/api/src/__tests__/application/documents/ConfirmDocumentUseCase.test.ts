import { describe, it, expect, vi } from 'vitest';
import { ConfirmDocumentUseCase } from '#src/use-cases/documents/ConfirmDocumentUseCase.js';
import {
  makeDocument,
  makeDocumentRepository,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { QuotaExceededError } from '#src/use-cases/errors/DomainError.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeEntitlementService,
  makeFreeEntitlements,
} from '#src/__tests__/helpers/mocks/plans.js';
import { CONTENT_LIMITS, PLAN_LIMITS } from '#src/use-cases/constants.js';

describe('ConfirmDocumentUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new ConfirmDocumentUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase
      .execute({
        userId: 'user-1',
        applicationId: 'app-missing',
        storageKey: 'key',
        name: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to another user', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new ConfirmDocumentUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase
      .execute({
        userId: 'user-1',
        applicationId: 'app-1',
        storageKey: 'users/user-1/applications/app-1/upload.pdf',
        name: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('throws VALIDATION when the mimeType is not allowed', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });

    const useCase = new ConfirmDocumentUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase
      .execute({
        userId: 'user-1',
        applicationId: 'app-1',
        storageKey: 'key',
        name: 'malware.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 1000,
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(applicationRepository.findById).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when sizeBytes is not positive', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });

    const useCase = new ConfirmDocumentUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase
      .execute({
        userId: 'user-1',
        applicationId: 'app-1',
        storageKey: 'key',
        name: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: -1,
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(applicationRepository.findById).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when sizeBytes exceeds the maximum allowed size', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });

    const useCase = new ConfirmDocumentUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
      documentRepository: makeDocumentRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase
      .execute({
        userId: 'user-1',
        applicationId: 'app-1',
        storageKey: 'key',
        name: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 11 * 1024 * 1024,
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(applicationRepository.findById).not.toHaveBeenCalled();
  });

  it('creates the document record with all provided fields and generated id', async () => {
    const doc = makeDocument();
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const documentRepository = makeDocumentRepository({
      create: vi.fn().mockResolvedValue(doc),
    });
    const generateId = vi.fn().mockReturnValue('doc-1');

    const useCase = new ConfirmDocumentUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
      documentRepository,
      generateId,
    });
    const result = await useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      storageKey: 'users/user-1/applications/app-1/resume.pdf',
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
    });

    expect(result).toEqual(doc);
    expect(documentRepository.create).toHaveBeenCalledWith({
      id: 'doc-1',
      applicationId: 'app-1',
      storageKey: 'users/user-1/applications/app-1/resume.pdf',
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      documentType: undefined,
      version: undefined,
      storageLimitBytes: PLAN_LIMITS.pro.documentBytes,
    });
  });

  it("charges the upload against the owner's plan storage limit", async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const documentRepository = makeDocumentRepository({
      create: vi.fn().mockResolvedValue(makeDocument()),
    });
    const entitlementService = makeEntitlementService({
      forUserId: vi.fn().mockResolvedValue(makeFreeEntitlements()),
    });

    const useCase = new ConfirmDocumentUseCase({
      entitlementService,
      applicationRepository,
      documentRepository,
      generateId: vi.fn().mockReturnValue('doc-1'),
    });
    await useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      storageKey: 'users/user-1/applications/app-1/resume.pdf',
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
    });

    expect(entitlementService.forUserId).toHaveBeenCalledWith('user-1');
    expect(documentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ storageLimitBytes: CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES }),
    );
  });

  it('passes documentType and version to the repository', async () => {
    const doc = makeDocument({ documentType: 'resume', version: 'v2' });
    const documentRepository = makeDocumentRepository({
      create: vi.fn().mockResolvedValue(doc),
    });
    const useCase = new ConfirmDocumentUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
      }),
      documentRepository,
      generateId: vi.fn().mockReturnValue('doc-1'),
    });

    const result = await useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      storageKey: 'users/user-1/applications/app-1/resume.pdf',
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      documentType: 'resume',
      version: 'v2',
    });

    expect(result.documentType).toBe('resume');
    expect(result.version).toBe('v2');
    expect(documentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: 'resume', version: 'v2' }),
    );
  });

  it('propagates a document quota error from the atomic repository reservation', async () => {
    const documentRepository = makeDocumentRepository({
      create: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('document limit reached'), { code: 'QUOTA_EXCEEDED' }),
        ),
    });
    const storageProvider = makeStorageProvider({
      delete: vi.fn().mockResolvedValue(undefined),
      headObject: vi.fn().mockResolvedValue({ size: 1000 }),
    });
    const useCase = new ConfirmDocumentUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
      }),
      documentRepository,
      storageProvider,
      generateId: vi.fn().mockReturnValue('doc-1'),
    });

    await expect(
      useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        storageKey: 'users/user-1/applications/app-1/upload.pdf',
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(storageProvider.delete).toHaveBeenCalledWith(
      'users/user-1/applications/app-1/upload.pdf',
    );
  });
  describe('stored size (JEF-425)', () => {
    const input = {
      userId: 'user-1',
      applicationId: 'app-1',
      storageKey: 'users/user-1/applications/app-1/upload.pdf',
      name: 'file.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
    };
    const build = (head: { size: number } | null) => {
      const storageProvider = makeStorageProvider({ headObject: vi.fn().mockResolvedValue(head) });
      const documentRepository = makeDocumentRepository({
        create: vi.fn().mockResolvedValue(makeDocument()),
      });
      const useCase = new ConfirmDocumentUseCase({
        entitlementService: makeEntitlementService(),
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
        }),
        documentRepository,
        storageProvider,
        generateId: vi.fn().mockReturnValue('id'),
      });
      return { useCase, storageProvider, documentRepository };
    };

    it('rejects an upload whose stored size differs from the reported one, and removes the blob', async () => {
      const { useCase, storageProvider, documentRepository } = build({ size: 9_000_000 });

      const err = await useCase.execute(input).catch((e) => e);

      expect((err as { code: string }).code).toBe('VALIDATION');
      expect(documentRepository.create).not.toHaveBeenCalled();
      expect(storageProvider.delete).toHaveBeenCalledWith(input.storageKey);
    });

    it('rejects a confirm for an object that was never uploaded', async () => {
      const { useCase, documentRepository } = build(null);

      const err = await useCase.execute(input).catch((e) => e);

      expect((err as { code: string }).code).toBe('VALIDATION');
      expect(documentRepository.create).not.toHaveBeenCalled();
    });

    it('removes the blob when the repository refuses for a full account', async () => {
      const { useCase, storageProvider, documentRepository } = build({ size: 1000 });
      vi.mocked(documentRepository.create).mockRejectedValue(new QuotaExceededError('full'));

      const err = await useCase.execute(input).catch((e) => e);

      expect((err as { code: string }).code).toBe('QUOTA_EXCEEDED');
      expect(storageProvider.delete).toHaveBeenCalledWith(input.storageKey);
    });

    it('creates the document when the stored size matches', async () => {
      const { useCase, documentRepository } = build({ size: 1000 });

      await useCase.execute(input);

      expect(documentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ sizeBytes: 1000 }),
      );
    });
  });
});
