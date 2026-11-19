import { describe, it, expect, vi } from 'vitest';
import { ComputeHealthScoreUseCase } from '#src/use-cases/application/ComputeHealthScoreUseCase.js';
import { makeContact, makeContactRepository } from '#src/__tests__/helpers/mocks/contacts.js';
import { makeDocument, makeDocumentRepository } from '#src/__tests__/helpers/mocks/documents.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeNote, makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';

function makeDeps(
  appOverrides = {},
  noteCount = 0,
  docCount = 0,
  roundCount = 0,
  contactCount = 0,
) {
  const app = makeApplication(appOverrides);
  const notes = Array.from({ length: noteCount }, (_, i) => makeNote({ id: `note-${i}` }));
  const docs = Array.from({ length: docCount }, (_, i) => makeDocument({ id: `doc-${i}` }));
  const rounds = Array.from({ length: roundCount }, (_, i) =>
    makeInterviewRound({ id: `round-${i}` }),
  );
  const contacts = Array.from({ length: contactCount }, (_, i) =>
    makeContact({ id: `contact-${i}` }),
  );

  return {
    app,
    deps: {
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(app),
      }),
      noteRepository: makeNoteRepository({
        findAllByApplicationId: vi.fn().mockResolvedValue(notes),
      }),
      documentRepository: makeDocumentRepository({
        findAllByApplicationId: vi.fn().mockResolvedValue(docs),
      }),
      interviewRoundRepository: makeInterviewRoundRepository({
        findAllByApplicationId: vi.fn().mockResolvedValue(rounds),
      }),
      contactRepository: makeContactRepository({
        findAllByApplicationId: vi.fn().mockResolvedValue(contacts),
      }),
    },
  };
}

describe('ComputeHealthScoreUseCase', () => {
  it('returns 0 for a bare application with no enrichment', async () => {
    const { deps } = makeDeps({
      description: null,
      appliedAt: null,
      followUpAt: null,
      jobUrl: null,
      salaryRange: null,
      location: null,
      source: null,
    });

    const result = await new ComputeHealthScoreUseCase(deps).execute('app-1', 'user-1');

    expect(result.score).toBe(0);
    expect(result.label).toBe('Needs attention');
    expect(result.criteria.every((c) => !c.met)).toBe(true);
  });

  it('awards full 100 when all criteria are met', async () => {
    const { deps } = makeDeps(
      {
        description: 'We build great products.',
        appliedAt: new Date(),
        followUpAt: new Date(),
        jobUrl: 'https://example.com/job',
        salaryRange: '$100k–$120k',
        location: 'Remote',
        source: 'LinkedIn',
      },
      1, // notes
      1, // docs
      1, // rounds
      1, // contacts
    );

    const result = await new ComputeHealthScoreUseCase(deps).execute('app-1', 'user-1');

    expect(result.score).toBe(100);
    expect(result.label).toBe('Complete');
    expect(result.criteria.every((c) => c.met)).toBe(true);
  });

  it('computes partial score correctly', async () => {
    // description (20) + appliedAt (15) + followUpAt (10) = 45
    const { deps } = makeDeps({
      description: 'Some job description',
      appliedAt: new Date(),
      followUpAt: new Date(),
      jobUrl: null,
      salaryRange: null,
      location: null,
      source: null,
    });

    const result = await new ComputeHealthScoreUseCase(deps).execute('app-1', 'user-1');

    expect(result.score).toBe(45);
    expect(result.label).toBe('In progress');
  });

  it('throws NOT_FOUND when application is not found', async () => {
    const { deps } = makeDeps();
    deps.applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const err = await new ComputeHealthScoreUseCase(deps)
      .execute('missing', 'user-1')
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Application not found');
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when application belongs to a different user', async () => {
    const { deps } = makeDeps({ userId: 'user-2' });

    const err = await new ComputeHealthScoreUseCase(deps)
      .execute('app-1', 'user-1')
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('returns correct criterion details in breakdown', async () => {
    const { deps } = makeDeps({ description: 'A role', appliedAt: null });

    const result = await new ComputeHealthScoreUseCase(deps).execute('app-1', 'user-1');

    const descCriterion = result.criteria.find((c) => c.key === 'description')!;
    expect(descCriterion.met).toBe(true);
    expect(descCriterion.earned).toBe(20);
    expect(descCriterion.points).toBe(20);

    const appliedCriterion = result.criteria.find((c) => c.key === 'appliedAt')!;
    expect(appliedCriterion.met).toBe(false);
    expect(appliedCriterion.earned).toBe(0);
  });

  it('gives "Looking good" label for score in 71-90 range', async () => {
    // description (20) + appliedAt (15) + notes (10) + docs (10) + followUpAt (10) + interviews (10) = 75
    const { deps } = makeDeps(
      {
        description: 'A job',
        appliedAt: new Date(),
        followUpAt: new Date(),
        jobUrl: null,
        salaryRange: null,
        location: null,
        source: null,
      },
      1, // notes
      1, // docs
      1, // rounds
      0, // no contacts
    );

    const result = await new ComputeHealthScoreUseCase(deps).execute('app-1', 'user-1');

    expect(result.score).toBe(75);
    expect(result.label).toBe('Looking good');
  });
});
