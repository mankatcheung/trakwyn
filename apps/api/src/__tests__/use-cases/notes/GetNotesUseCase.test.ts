import { describe, it, expect, vi } from 'vitest';
import { GetNotesUseCase } from '#src/use-cases/notes/GetNotesUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeNote, makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';

describe('GetNotesUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new GetNotesUseCase({
      applicationRepository,
      noteRepository: makeNoteRepository(),
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

    const useCase = new GetNotesUseCase({
      applicationRepository,
      noteRepository: makeNoteRepository(),
    });
    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('returns all notes for the application', async () => {
    const notes = [makeNote({ id: 'note-1' }), makeNote({ id: 'note-2' })];
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const noteRepository = makeNoteRepository({
      findAllByApplicationId: vi.fn().mockResolvedValue(notes),
    });

    const useCase = new GetNotesUseCase({ applicationRepository, noteRepository });
    const result = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(result).toEqual(notes);
    expect(noteRepository.findAllByApplicationId).toHaveBeenCalledWith('app-1');
  });
});
