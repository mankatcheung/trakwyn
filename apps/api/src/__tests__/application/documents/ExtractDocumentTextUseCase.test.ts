import { describe, it, expect, vi } from 'vitest';
import { ExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import {
  makeDocument,
  makeDocumentRepository,
  makeDocumentTextExtractor,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeUseCase(overrides?: {
  documentRepository?: ReturnType<typeof makeDocumentRepository>;
  applicationRepository?: ReturnType<typeof makeApplicationRepository>;
  documentTextExtractor?: ReturnType<typeof makeDocumentTextExtractor>;
  storageProvider?: ReturnType<typeof makeStorageProvider>;
}) {
  const deps = {
    documentRepository: makeDocumentRepository({
      findById: vi.fn().mockResolvedValue(makeDocument({ applicationId: 'app-1' })),
    }),
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ id: 'app-1', userId: 'user-1' })),
    }),
    documentTextExtractor: makeDocumentTextExtractor(),
    storageProvider: makeStorageProvider(),
    ...overrides,
  };
  return {
    deps,
    useCase: new ExtractDocumentTextUseCase(
      deps.documentRepository,
      deps.applicationRepository,
      deps.documentTextExtractor,
      deps.storageProvider,
    ),
  };
}

const codeOf = (err: unknown) => (err as { code?: string }).code;

describe('ExtractDocumentTextUseCase', () => {
  it("reads the file from storage by its key, not through a URL, and returns the extractor's text", async () => {
    const { useCase, deps } = makeUseCase();

    const result = await useCase.execute({ userId: 'user-1', documentId: 'doc-1' });

    expect(deps.storageProvider.getObject).toHaveBeenCalledWith(
      'users/user-1/applications/app-1/resume.pdf',
    );
    expect(deps.storageProvider.getSignedUrl).not.toHaveBeenCalled();
    expect(deps.documentTextExtractor.extract).toHaveBeenCalledWith(
      Buffer.from('resume bytes'),
      'application/pdf',
    );
    expect(result).toEqual({ text: 'extracted resume text' });
  });

  it('throws NOT_FOUND for a document that does not exist, without touching storage', async () => {
    const { useCase, deps } = makeUseCase({
      documentRepository: makeDocumentRepository({ findById: vi.fn().mockResolvedValue(null) }),
    });

    const error = await useCase.execute({ userId: 'user-1', documentId: 'nope' }).catch((e) => e);

    expect(codeOf(error)).toBe('NOT_FOUND');
    expect(deps.storageProvider.getObject).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN for another user's document, without touching storage", async () => {
    const { useCase, deps } = makeUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ id: 'app-1', userId: 'user-2' })),
      }),
    });

    const error = await useCase.execute({ userId: 'user-1', documentId: 'doc-1' }).catch((e) => e);

    expect(codeOf(error)).toBe('FORBIDDEN');
    expect(deps.storageProvider.getObject).not.toHaveBeenCalled();
    expect(deps.documentTextExtractor.extract).not.toHaveBeenCalled();
  });

  it('fails when the file is missing from storage', async () => {
    const { useCase, deps } = makeUseCase({
      storageProvider: makeStorageProvider({ getObject: vi.fn().mockResolvedValue(null) }),
    });

    await expect(useCase.execute({ userId: 'user-1', documentId: 'doc-1' })).rejects.toThrow(
      'Failed to read the document file',
    );
    expect(deps.documentTextExtractor.extract).not.toHaveBeenCalled();
  });
});
