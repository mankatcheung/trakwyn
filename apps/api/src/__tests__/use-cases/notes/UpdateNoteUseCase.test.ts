import { describe, it, expect, vi } from 'vitest';
import { UpdateNoteUseCase } from '#src/use-cases/notes/UpdateNoteUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeNote, makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';

describe('UpdateNoteUseCase', () => {
  it('throws NOT_FOUND when the note does not exist', async () => {
    const noteRepository = makeNoteRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new UpdateNoteUseCase({
      applicationRepository: makeApplicationRepository(),
      noteRepository,
    });
    const err = await useCase
      .execute({ userId: 'user-1', noteId: 'note-missing', content: 'updated' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the parent application belongs to another user', async () => {
    const noteRepository = makeNoteRepository({
      findById: vi.fn().mockResolvedValue(makeNote({ applicationId: 'app-1' })),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new UpdateNoteUseCase({ applicationRepository, noteRepository });
    const err = await useCase
      .execute({ userId: 'user-1', noteId: 'note-1', content: 'updated' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('throws FORBIDDEN when the parent application does not exist', async () => {
    const noteRepository = makeNoteRepository({
      findById: vi.fn().mockResolvedValue(makeNote()),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new UpdateNoteUseCase({ applicationRepository, noteRepository });
    const err = await useCase
      .execute({ userId: 'user-1', noteId: 'note-1', content: 'updated' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('updates the note content and returns the updated note', async () => {
    const updated = makeNote({ content: 'Updated content' });
    const noteRepository = makeNoteRepository({
      findById: vi.fn().mockResolvedValue(makeNote()),
      update: vi.fn().mockResolvedValue(updated),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });

    const useCase = new UpdateNoteUseCase({ applicationRepository, noteRepository });
    const result = await useCase.execute({
      userId: 'user-1',
      noteId: 'note-1',
      content: 'Updated content',
    });

    expect(result).toEqual(updated);
    expect(noteRepository.update).toHaveBeenCalledWith('note-1', 'Updated content');
  });
});
