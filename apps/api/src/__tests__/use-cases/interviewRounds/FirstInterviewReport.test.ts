import { describe, expect, it, vi } from 'vitest';
import { CreateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/CreateInterviewRoundUseCase.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { IAiAnalytics } from '#src/use-cases/ports/IAiAnalytics.js';
import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';

const generation = {
  provider: 'workersai',
  model: 'gpt-oss-120b',
  promptVersion: 6,
  source: 'platform',
  tier: 'standard',
};

const resume = (over: Partial<DocumentDraft> = {}) =>
  makeDocumentDraft({ type: 'resume', generation, ...over });

function build(options: {
  existingRounds?: number;
  drafts?: DocumentDraft[];
  appliedAt?: Date | null;
  findAllByApplicationId?: (applicationId: string) => Promise<DocumentDraft[]>;
  interviewReached?: ReturnType<typeof vi.fn>;
}) {
  const aiAnalytics = {
    interviewReached: options.interviewReached ?? vi.fn(),
  } as unknown as IAiAnalytics;
  const logger = makeLogger();
  const documentDraftRepository = makeDocumentDraftRepository({
    findAllByApplicationId:
      options.findAllByApplicationId ?? vi.fn().mockResolvedValue(options.drafts ?? []),
  });
  const useCase = new CreateInterviewRoundUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeApplication({ appliedAt: options.appliedAt ?? null })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      countByApplicationId: vi.fn().mockResolvedValue(options.existingRounds ?? 0),
      create: vi.fn().mockResolvedValue(makeInterviewRound()),
    }),
    documentDraftRepository,
    aiAnalytics,
    logger,
    generateId: () => 'id-1',
  });
  return { useCase, aiAnalytics, logger, documentDraftRepository };
}

const run = (useCase: CreateInterviewRoundUseCase) =>
  useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

describe('the first interview round (JEF-598)', () => {
  it('reports which prompt version and model wrote the resume, and nothing that names it', async () => {
    const { useCase, aiAnalytics } = build({ drafts: [resume()] });

    await run(useCase);

    expect(aiAnalytics.interviewReached).toHaveBeenCalledTimes(1);
    expect(aiAnalytics.interviewReached).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'workersai',
      model: 'gpt-oss-120b',
      promptVersion: 6,
      source: 'platform',
      tier: 'standard',
    });
  });

  it('reports only the first round, not the second', async () => {
    const { useCase, aiAnalytics, documentDraftRepository } = build({
      existingRounds: 1,
      drafts: [resume()],
    });

    await run(useCase);

    expect(aiAnalytics.interviewReached).not.toHaveBeenCalled();
    expect(documentDraftRepository.findAllByApplicationId).not.toHaveBeenCalled();
  });

  it('reports nothing for an application whose resume the AI did not write', async () => {
    const { useCase, aiAnalytics } = build({ drafts: [resume({ generation: null })] });
    await run(useCase);
    expect(aiAnalytics.interviewReached).not.toHaveBeenCalled();

    const noDrafts = build({ drafts: [] });
    await run(noDrafts.useCase);
    expect(noDrafts.aiAnalytics.interviewReached).not.toHaveBeenCalled();
  });

  it('applies the same applied-date rule as the outcomes view', async () => {
    const { useCase, aiAnalytics } = build({
      appliedAt: new Date('2024-03-15T00:00:00Z'),
      drafts: [resume({ createdAt: new Date('2024-04-01T00:00:00Z') })],
    });

    await run(useCase);

    expect(aiAnalytics.interviewReached).not.toHaveBeenCalled();
  });

  it('never fails the user’s own action when reporting goes wrong', async () => {
    const failingLookup = build({
      findAllByApplicationId: vi.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(run(failingLookup.useCase)).resolves.toBeDefined();
    expect(failingLookup.logger.warn).toHaveBeenCalled();

    const throwingSend = build({
      drafts: [resume()],
      interviewReached: vi.fn().mockImplementation(() => {
        throw new Error('posthog down');
      }),
    });
    await expect(run(throwingSend.useCase)).resolves.toBeDefined();
  });

  it('works where no analytics or draft repository is wired', async () => {
    const useCase = new CreateInterviewRoundUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
      }),
      interviewRoundRepository: makeInterviewRoundRepository({
        create: vi.fn().mockResolvedValue(makeInterviewRound()),
      }),
      generateId: () => 'id-1',
    });

    await expect(run(useCase)).resolves.toBeDefined();
  });
});
