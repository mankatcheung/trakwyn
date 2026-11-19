import { describe, it, expect, vi } from 'vitest';
import { ExportDocumentDraftToPdfUseCase } from '#src/use-cases/documents/ExportDocumentDraftToPdfUseCase.js';
import {
  makeDocument,
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeDocumentRepository,
  makePdfRenderer,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';
import { CONTENT_LIMITS, PLAN_LIMITS } from '#src/use-cases/constants.js';

describe('ExportDocumentDraftToPdfUseCase', () => {
  const generateId = () => 'test-doc-id';

  it('throws NOT_FOUND when the draft does not exist', async () => {
    const documentDraftRepository = makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new ExportDocumentDraftToPdfUseCase({
      entitlementService: makeEntitlementService(),
      documentDraftRepository,
      documentRepository: makeDocumentRepository(),
      applicationRepository: makeApplicationRepository(),
      storageProvider: makeStorageProvider(),
      pdfRenderer: makePdfRenderer(),
      generateId,
    });
    const err = await useCase
      .execute({ userId: 'user-1', draftId: 'draft-missing' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to another user', async () => {
    const documentDraftRepository = makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(makeDocumentDraft()),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new ExportDocumentDraftToPdfUseCase({
      entitlementService: makeEntitlementService(),
      documentDraftRepository,
      documentRepository: makeDocumentRepository(),
      applicationRepository,
      storageProvider: makeStorageProvider(),
      pdfRenderer: makePdfRenderer(),
      generateId,
    });
    const err = await useCase.execute({ userId: 'user-1', draftId: 'draft-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('renders PDF, stores it, and creates document record', async () => {
    const draft = makeDocumentDraft({ title: 'My Cover Letter' });
    const expectedDoc = makeDocument({ name: 'My_Cover_Letter.pdf' });
    const pdfBuffer = Buffer.from('pdf-content');

    const documentDraftRepository = makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(draft),
    });
    const documentRepository = makeDocumentRepository({
      create: vi.fn().mockResolvedValue(expectedDoc),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const storageProvider = makeStorageProvider();
    const pdfRenderer = makePdfRenderer({
      render: vi.fn().mockResolvedValue(pdfBuffer),
    });

    const useCase = new ExportDocumentDraftToPdfUseCase({
      entitlementService: makeEntitlementService(),
      documentDraftRepository,
      documentRepository,
      applicationRepository,
      storageProvider,
      pdfRenderer,
      generateId,
    });
    const result = await useCase.execute({ userId: 'user-1', draftId: 'draft-1' });

    expect(result).toEqual(expectedDoc);
    expect(pdfRenderer.render).toHaveBeenCalledWith({
      title: 'My Cover Letter',
      contentJson: draft.contentJson,
    });
    expect(storageProvider.putObject).toHaveBeenCalledWith(
      expect.stringContaining('documents/app-1/'),
      pdfBuffer,
      'application/pdf',
    );
    expect(documentRepository.create).toHaveBeenCalledWith({
      id: 'test-doc-id',
      applicationId: 'app-1',
      name: 'My_Cover_Letter.pdf',
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      storageKey: expect.stringContaining('documents/app-1/'),
      documentType: 'cover_letter',
      sourceDraftId: 'draft-1',
      storageLimitBytes: PLAN_LIMITS.pro.documentBytes,
      documentsPerApplicationLimit: CONTENT_LIMITS.DOCUMENTS_PER_APPLICATION,
    });
  });

  it('deletes the rendered PDF when document creation is rejected', async () => {
    const storageProvider = makeStorageProvider();
    const documentRepository = makeDocumentRepository({
      create: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('document limit reached'), { code: 'QUOTA_EXCEEDED' }),
        ),
    });
    const useCase = new ExportDocumentDraftToPdfUseCase({
      entitlementService: makeEntitlementService(),
      documentDraftRepository: makeDocumentDraftRepository({
        findById: vi.fn().mockResolvedValue(makeDocumentDraft()),
      }),
      documentRepository,
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
      }),
      storageProvider,
      pdfRenderer: makePdfRenderer({ render: vi.fn().mockResolvedValue(Buffer.from('pdf')) }),
      generateId,
    });

    await expect(useCase.execute({ userId: 'user-1', draftId: 'draft-1' })).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    expect(storageProvider.delete).toHaveBeenCalledWith('documents/app-1/test-doc-id.pdf');
  });
});
