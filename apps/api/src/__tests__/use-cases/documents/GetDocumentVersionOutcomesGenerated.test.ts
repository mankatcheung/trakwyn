import { describe, expect, it, vi } from 'vitest';
import {
  GENERATED_RESUME_VERSION,
  GetDocumentVersionOutcomesUseCase,
} from '#src/use-cases/documents/GetDocumentVersionOutcomesUseCase.js';
import {
  makeDocument,
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeDocumentRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';
import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';

const generation = {
  provider: 'workersai',
  model: 'gpt-oss-120b',
  promptVersion: 6,
  source: 'platform',
  tier: null,
};

const generatedResume = (applicationId: string, over: Partial<DocumentDraft> = {}) =>
  makeDocumentDraft({
    id: `draft-${applicationId}`,
    applicationId,
    type: 'resume',
    generation,
    ...over,
  });

function build(options: {
  drafts?: DocumentDraft[];
  applications?: ReturnType<typeof makeApplication>[];
  interviewApplicationIds?: string[];
  documents?: ReturnType<typeof makeDocument>[];
}) {
  const entitlementService = makeEntitlementService();
  const useCase = new GetDocumentVersionOutcomesUseCase({
    entitlementService,
    documentRepository: makeDocumentRepository({
      findAllByUserId: vi.fn().mockResolvedValue(options.documents ?? []),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findAllByUserId: vi
        .fn()
        .mockResolvedValue(
          (options.interviewApplicationIds ?? []).map((applicationId) =>
            makeInterviewRound({ applicationId }),
          ),
        ),
    }),
    documentDraftRepository: makeDocumentDraftRepository({
      findResumeDraftsByUserId: vi.fn().mockResolvedValue(options.drafts ?? []),
    }),
    applicationRepository: makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(options.applications ?? []),
    }),
  });
  return { useCase, entitlementService };
}

describe('GetDocumentVersionOutcomesUseCase: generated resumes (JEF-598)', () => {
  it('adds a Generated row with the applications and the share that reached an interview', async () => {
    const { useCase } = build({
      applications: [
        makeApplication({ id: 'app-1' }),
        makeApplication({ id: 'app-2' }),
        makeApplication({ id: 'app-3' }),
        makeApplication({ id: 'app-4' }),
      ],
      drafts: ['app-1', 'app-2', 'app-3', 'app-4'].map((id) => generatedResume(id)),
      interviewApplicationIds: ['app-2'],
    });

    const rows = await useCase.execute({ userId: 'user-1' });

    expect(rows).toEqual([
      {
        documentType: 'resume',
        version: GENERATED_RESUME_VERSION,
        applicationCount: 4,
        interviewCount: 1,
        interviewRate: 25,
      },
    ]);
  });

  it('counts an application once however many resume drafts it has', async () => {
    const { useCase } = build({
      applications: [makeApplication({ id: 'app-1' })],
      drafts: [
        generatedResume('app-1', { id: 'a', updatedAt: new Date('2024-02-01') }),
        generatedResume('app-1', { id: 'b', updatedAt: new Date('2024-03-01') }),
      ],
    });

    const [row] = await useCase.execute({ userId: 'user-1' });

    expect(row).toMatchObject({ version: 'Generated', applicationCount: 1 });
  });

  it('leaves out resumes the AI did not write, and drafts on applications it cannot see', async () => {
    const { useCase } = build({
      applications: [makeApplication({ id: 'app-1' })],
      drafts: [
        generatedResume('app-1', { generation: null }),
        // An application in the trash is not in the user's list.
        generatedResume('app-in-trash'),
      ],
    });

    expect(await useCase.execute({ userId: 'user-1' })).toEqual([]);
  });

  it('uses the applied date to decide which draft the application went out with', async () => {
    const { useCase } = build({
      applications: [makeApplication({ id: 'app-1', appliedAt: new Date('2024-03-15') })],
      drafts: [
        // Written by hand before applying, then a generated one only afterwards.
        generatedResume('app-1', {
          id: 'typed',
          generation: null,
          createdAt: new Date('2024-03-01'),
        }),
        generatedResume('app-1', {
          id: 'after',
          createdAt: new Date('2024-04-01'),
          updatedAt: new Date('2024-04-01'),
        }),
      ],
    });

    expect(await useCase.execute({ userId: 'user-1' })).toEqual([]);
  });

  it('keeps it apart from an upload a user happened to label "Generated"', async () => {
    const { useCase } = build({
      documents: [
        makeDocument({
          id: 'doc-1',
          applicationId: 'app-9',
          documentType: 'resume',
          version: 'Generated',
        }),
      ],
      applications: [makeApplication({ id: 'app-1' })],
      drafts: [generatedResume('app-1')],
    });

    const rows = await useCase.execute({ userId: 'user-1' });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.applicationCount)).toEqual([1, 1]);
  });

  it('leaves the uploaded groups as they were and adds nothing without generated resumes', async () => {
    const { useCase } = build({
      documents: [makeDocument({ applicationId: 'app-1', documentType: 'resume', version: 'v3' })],
    });

    expect(await useCase.execute({ userId: 'user-1' })).toEqual([
      {
        documentType: 'resume',
        version: 'v3',
        applicationCount: 1,
        interviewCount: 0,
        interviewRate: 0,
      },
    ]);
  });

  it('still checks the analytics entitlement before reading anything', async () => {
    const { useCase, entitlementService } = build({});
    await useCase.execute({ userId: 'user-1' });
    expect(entitlementService.assertFeature).toHaveBeenCalledWith('user-1', 'analytics');
  });
});
