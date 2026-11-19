import { describe, it, expect, vi } from 'vitest';
import { DeleteNoteUseCase } from '#src/use-cases/notes/DeleteNoteUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeNote, makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';

describe('DeleteNoteUseCase', () => {
  it('throws NOT_FOUND when the note does not exist', async () => {
    const noteRepository = makeNoteRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new DeleteNoteUseCase({
      applicationRepository: makeApplicationRepository(),
      noteRepository,
    });
    const err = await useCase.execute({ userId: 'user-1', noteId: 'note-missing' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(noteRepository.delete).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the parent application belongs to another user', async () => {
    const noteRepository = makeNoteRepository({
      findById: vi.fn().mockResolvedValue(makeNote({ applicationId: 'app-1' })),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new DeleteNoteUseCase({ applicationRepository, noteRepository });
    const err = await useCase.execute({ userId: 'user-1', noteId: 'note-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(noteRepository.delete).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the parent application does not exist', async () => {
    const noteRepository = makeNoteRepository({
      findById: vi.fn().mockResolvedValue(makeNote()),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new DeleteNoteUseCase({ applicationRepository, noteRepository });
    const err = await useCase.execute({ userId: 'user-1', noteId: 'note-1' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('deletes the note when ownership is verified', async () => {
    const noteRepository = makeNoteRepository({
      findById: vi.fn().mockResolvedValue(makeNote()),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });

    const useCase = new DeleteNoteUseCase({ applicationRepository, noteRepository });
    await useCase.execute({ userId: 'user-1', noteId: 'note-1' });

    expect(noteRepository.delete).toHaveBeenCalledWith('note-1', 'app-1');
  });
});
