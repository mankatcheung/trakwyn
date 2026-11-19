import { describe, it, expect, vi } from 'vitest';
import { GetDocumentsUseCase } from '#src/use-cases/documents/GetDocumentsUseCase.js';
import { makeDocument, makeDocumentRepository } from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetDocumentsUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new GetDocumentsUseCase({
      applicationRepository,
      documentRepository: makeDocumentRepository(),
    });
    const err = await useCase
      .execute({ userId: 'user-1', applicationId: 'app-missing' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to another user', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new GetDocumentsUseCase({
      applicationRepository,
      documentRepository: makeDocumentRepository(),
    });
    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('returns all documents for the application', async () => {
    const docs = [makeDocument({ id: 'doc-1' }), makeDocument({ id: 'doc-2' })];
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const documentRepository = makeDocumentRepository({
      findAllByApplicationId: vi.fn().mockResolvedValue(docs),
    });

    const useCase = new GetDocumentsUseCase({ applicationRepository, documentRepository });
    const result = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(result).toEqual(docs);
    expect(documentRepository.findAllByApplicationId).toHaveBeenCalledWith('app-1');
  });
});
