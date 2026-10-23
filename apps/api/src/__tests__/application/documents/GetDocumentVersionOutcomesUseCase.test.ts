import { describe, it, expect, vi } from 'vitest';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';
import { GetDocumentVersionOutcomesUseCase } from '#src/use-cases/documents/GetDocumentVersionOutcomesUseCase.js';
import { makeDocument, makeDocumentRepository } from '#src/__tests__/helpers/mocks/documents.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';

describe('GetDocumentVersionOutcomesUseCase', () => {
  it('returns an empty list when the user has no documents', async () => {
    const documentRepository = makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetDocumentVersionOutcomesUseCase({
      entitlementService: makeEntitlementService(),
      documentRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([]);
  });

  it('groups documents by documentType and version, counting distinct applications', async () => {
    const documents = [
      makeDocument({
        id: 'doc-1',
        applicationId: 'app-1',
        documentType: 'resume',
        version: 'v3',
      }),
      makeDocument({
        id: 'doc-2',
        applicationId: 'app-2',
        documentType: 'resume',
        version: 'v3',
      }),
      makeDocument({
        id: 'doc-3',
        applicationId: 'app-3',
        documentType: 'resume',
        version: 'v2',
      }),
    ];
    const documentRepository = makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue(documents),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetDocumentVersionOutcomesUseCase({
      entitlementService: makeEntitlementService(),
      documentRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([
      {
        documentType: 'resume',
        version: 'v3',
        applicationCount: 2,
        interviewCount: 0,
        interviewRate: 0,
      },
      {
        documentType: 'resume',
        version: 'v2',
        applicationCount: 1,
        interviewCount: 0,
        interviewRate: 0,
      },
    ]);
  });

  it('counts an application as an interview when it has at least one InterviewRound', async () => {
    const documents = [
      makeDocument({ id: 'doc-1', applicationId: 'app-1', documentType: 'resume', version: 'v3' }),
      makeDocument({ id: 'doc-2', applicationId: 'app-2', documentType: 'resume', version: 'v3' }),
      makeDocument({ id: 'doc-3', applicationId: 'app-3', documentType: 'resume', version: 'v3' }),
      makeDocument({ id: 'doc-4', applicationId: 'app-4', documentType: 'resume', version: 'v3' }),
    ];
    const rounds = [
      makeInterviewRound({ id: 'r1', applicationId: 'app-1' }),
      makeInterviewRound({ id: 'r2', applicationId: 'app-2' }),
      // A second round on the same application must not double-count.
      makeInterviewRound({ id: 'r3', applicationId: 'app-2' }),
    ];
    const documentRepository = makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue(documents),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue(rounds),
    });

    const result = await new GetDocumentVersionOutcomesUseCase({
      entitlementService: makeEntitlementService(),
      documentRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([
      {
        documentType: 'resume',
        version: 'v3',
        applicationCount: 4,
        interviewCount: 2,
        interviewRate: 50,
      },
    ]);
  });

  it('dedupes multiple documents of the same version uploaded to the same application', async () => {
    const documents = [
      makeDocument({ id: 'doc-1', applicationId: 'app-1', documentType: 'resume', version: 'v3' }),
      makeDocument({ id: 'doc-2', applicationId: 'app-1', documentType: 'resume', version: 'v3' }),
    ];
    const documentRepository = makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue(documents),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetDocumentVersionOutcomesUseCase({
      entitlementService: makeEntitlementService(),
      documentRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([
      {
        documentType: 'resume',
        version: 'v3',
        applicationCount: 1,
        interviewCount: 0,
        interviewRate: 0,
      },
    ]);
  });

  it('groups documents with no version under version: null', async () => {
    const documents = [
      makeDocument({ id: 'doc-1', applicationId: 'app-1', documentType: 'resume', version: null }),
      makeDocument({ id: 'doc-2', applicationId: 'app-2', documentType: 'resume', version: null }),
    ];
    const documentRepository = makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue(documents),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetDocumentVersionOutcomesUseCase({
      entitlementService: makeEntitlementService(),
      documentRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([
      {
        documentType: 'resume',
        version: null,
        applicationCount: 2,
        interviewCount: 0,
        interviewRate: 0,
      },
    ]);
  });

  it('keeps resume and cover_letter versions of the same name as separate groups', async () => {
    const documents = [
      makeDocument({ id: 'doc-1', applicationId: 'app-1', documentType: 'resume', version: 'v1' }),
      makeDocument({
        id: 'doc-2',
        applicationId: 'app-1',
        documentType: 'cover_letter',
        version: 'v1',
      }),
    ];
    const documentRepository = makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue(documents),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetDocumentVersionOutcomesUseCase({
      entitlementService: makeEntitlementService(),
      documentRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.documentType).sort()).toEqual(['cover_letter', 'resume']);
  });

  it('excludes document types other than resume and cover_letter', async () => {
    const documents = [
      makeDocument({ id: 'doc-1', applicationId: 'app-1', documentType: 'resume', version: 'v1' }),
      makeDocument({
        id: 'doc-2',
        applicationId: 'app-2',
        documentType: 'portfolio',
        version: 'v1',
      }),
      makeDocument({ id: 'doc-3', applicationId: 'app-3', documentType: 'other', version: 'v1' }),
    ];
    const documentRepository = makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue(documents),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetDocumentVersionOutcomesUseCase({
      entitlementService: makeEntitlementService(),
      documentRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([
      {
        documentType: 'resume',
        version: 'v1',
        applicationCount: 1,
        interviewCount: 0,
        interviewRate: 0,
      },
    ]);
  });

  it('sorts groups by applicationCount descending', async () => {
    const documents = [
      makeDocument({ id: 'doc-1', applicationId: 'app-1', documentType: 'resume', version: 'v1' }),
      makeDocument({ id: 'doc-2', applicationId: 'app-2', documentType: 'resume', version: 'v2' }),
      makeDocument({ id: 'doc-3', applicationId: 'app-3', documentType: 'resume', version: 'v2' }),
      makeDocument({ id: 'doc-4', applicationId: 'app-4', documentType: 'resume', version: 'v2' }),
    ];
    const documentRepository = makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue(documents),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetDocumentVersionOutcomesUseCase({
      entitlementService: makeEntitlementService(),
      documentRepository,
      interviewRoundRepository,
    }).execute({ userId: 'user-1' });

    expect(result.map((r) => r.version)).toEqual(['v2', 'v1']);
  });
});
