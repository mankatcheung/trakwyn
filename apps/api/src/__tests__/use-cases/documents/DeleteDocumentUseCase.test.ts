import { describe, it, expect, vi } from 'vitest';
import { DeleteDocumentUseCase } from '#src/use-cases/documents/DeleteDocumentUseCase.js';
import {
  makeDocument,
  makeDocumentRepository,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('DeleteDocumentUseCase', () => {
  it('throws NOT_FOUND when the document does not exist', async () => {
    const documentRepository = makeDocumentRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new DeleteDocumentUseCase({
      applicationRepository: makeApplicationRepository(),
      documentRepository,
      storageProvider: makeStorageProvider(),
    });
    const err = await useCase
      .execute({ userId: 'user-1', documentId: 'doc-missing' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(documentRepository.delete).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the parent application belongs to another user', async () => {
    const documentRepository = makeDocumentRepository({
      findById: vi.fn().mockResolvedValue(makeDocument({ applicationId: 'app-1' })),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new DeleteDocumentUseCase({
      applicationRepository,
      documentRepository,
      storageProvider: makeStorageProvider(),
    });
    const err = await useCase.execute({ userId: 'user-1', documentId: 'doc-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(documentRepository.delete).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the parent application does not exist', async () => {
    const documentRepository = makeDocumentRepository({
      findById: vi.fn().mockResolvedValue(makeDocument()),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new DeleteDocumentUseCase({
      applicationRepository,
      documentRepository,
      storageProvider: makeStorageProvider(),
    });
    const err = await useCase.execute({ userId: 'user-1', documentId: 'doc-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('deletes from storage before removing the document record', async () => {
    const doc = makeDocument({ storageKey: 'users/user-1/applications/app-1/resume.pdf' });
    const documentRepository = makeDocumentRepository({
      findById: vi.fn().mockResolvedValue(doc),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const storageProvider = makeStorageProvider({
      delete: vi.fn().mockResolvedValue(undefined),
    });

    const useCase = new DeleteDocumentUseCase({
      applicationRepository,
      documentRepository,
      storageProvider,
    });
    await useCase.execute({ userId: 'user-1', documentId: 'doc-1' });

    expect(storageProvider.delete).toHaveBeenCalledWith(doc.storageKey);
    expect(documentRepository.delete).toHaveBeenCalledWith('doc-1', 'app-1');

    const storageOrder = vi.mocked(storageProvider.delete).mock.invocationCallOrder[0];
    const dbOrder = vi.mocked(documentRepository.delete).mock.invocationCallOrder[0];
    expect(storageOrder).toBeLessThan(dbOrder);
  });
});
