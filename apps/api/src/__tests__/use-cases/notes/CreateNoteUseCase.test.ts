import { describe, it, expect, vi } from 'vitest';
import { CreateNoteUseCase } from '#src/use-cases/notes/CreateNoteUseCase.js';
import { makeActivityLogRepository } from '#src/__tests__/helpers/mocks/activity.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeNote, makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';

describe('CreateNoteUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new CreateNoteUseCase({
      applicationRepository,
      noteRepository: makeNoteRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase
      .execute({ userId: 'user-1', applicationId: 'app-missing', content: 'note' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to another user', async () => {
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new CreateNoteUseCase({
      applicationRepository,
      noteRepository: makeNoteRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase
      .execute({ userId: 'user-1', applicationId: 'app-1', content: 'note' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('creates a note with the correct data and generated id', async () => {
    const note = makeNote({ content: 'Great interview!' });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });
    const noteRepository = makeNoteRepository({
      create: vi.fn().mockResolvedValue(note),
    });
    const generateId = vi.fn().mockReturnValue('note-1');

    const useCase = new CreateNoteUseCase({ applicationRepository, noteRepository, generateId });
    const result = await useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      content: 'Great interview!',
    });

    expect(result).toEqual(note);
    expect(noteRepository.create).toHaveBeenCalledWith({
      id: 'note-1',
      applicationId: 'app-1',
      content: 'Great interview!',
    });
  });

  it('records the MCP source and token in the activity log, and nothing extra otherwise (JEF-466)', async () => {
    const actor = { source: 'mcp' as const, apiTokenId: 'tok-1', apiTokenName: 'Claude Desktop' };
    const build = () => {
      const activityLogRepository = makeActivityLogRepository();
      const useCase = new CreateNoteUseCase({
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(makeApplication()),
        }),
        noteRepository: makeNoteRepository({ create: vi.fn().mockResolvedValue(makeNote()) }),
        activityLogRepository,
        generateId: vi.fn().mockReturnValue('id-1'),
      });
      return { useCase, activityLogRepository };
    };

    const viaMcp = build();
    await viaMcp.useCase.execute({ userId: 'user-1', applicationId: 'app-1', content: 'x', actor });
    expect(viaMcp.activityLogRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ payload: JSON.stringify({ noteId: 'note-1', ...actor }) }),
    );

    const direct = build();
    await direct.useCase.execute({ userId: 'user-1', applicationId: 'app-1', content: 'x' });
    expect(direct.activityLogRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ payload: JSON.stringify({ noteId: 'note-1' }) }),
    );
  });
});
