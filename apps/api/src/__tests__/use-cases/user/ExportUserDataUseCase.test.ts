import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportUserDataUseCase } from '#src/use-cases/user/ExportUserDataUseCase.js';
import { makeDocument, makeDocumentRepository } from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeNote, makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('ExportUserDataUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeDeps = (overrides?: object) => ({
    userRepository: makeUserRepository(),
    applicationRepository: makeApplicationRepository(),
    noteRepository: makeNoteRepository(),
    documentRepository: makeDocumentRepository(),
    ...overrides,
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const deps = makeDeps({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(null) }),
    });

    const err = await new ExportUserDataUseCase(deps).execute('missing-id').catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('returns export with empty applications when user has none', async () => {
    const user = makeUser();
    const deps = makeDeps({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
      applicationRepository: makeApplicationRepository({
        findAllByUserId: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await new ExportUserDataUseCase(deps).execute('user-1');

    expect(result.user.email).toBe(user.email);
    expect(result.user.createdAt).toBe(user.createdAt.toISOString());
    expect(result.applications).toHaveLength(0);
    expect(typeof result.exportedAt).toBe('string');
  });

  it('returns full application data including notes and documents', async () => {
    const user = makeUser();
    const app = makeApplication({ id: 'app-1', appliedAt: new Date('2024-03-01') });
    const note = makeNote({ applicationId: 'app-1', content: 'Great interview' });
    const doc = makeDocument({ applicationId: 'app-1', name: 'cv.pdf' });

    const deps = makeDeps({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
      applicationRepository: makeApplicationRepository({
        findAllByUserId: vi.fn().mockResolvedValue([app]),
      }),
      noteRepository: makeNoteRepository({
        findAllByApplicationId: vi.fn().mockResolvedValue([note]),
      }),
      documentRepository: makeDocumentRepository({
        findAllByApplicationId: vi.fn().mockResolvedValue([doc]),
      }),
    });

    const result = await new ExportUserDataUseCase(deps).execute('user-1');

    expect(result.applications).toHaveLength(1);
    const exported = result.applications[0];
    expect(exported.company).toBe(app.company);
    expect(exported.role).toBe(app.role);
    expect(exported.status).toBe(app.status);
    expect(exported.appliedAt).toBe(app.appliedAt!.toISOString());

    expect(exported.notes).toHaveLength(1);
    expect(exported.notes[0].content).toBe(note.content);
    expect(typeof exported.notes[0].createdAt).toBe('string');

    expect(exported.documents).toHaveLength(1);
    expect(exported.documents[0].name).toBe(doc.name);
    expect(exported.documents[0].mimeType).toBe(doc.mimeType);
    expect(exported.documents[0].sizeBytes).toBe(doc.sizeBytes);
  });

  it('sets appliedAt to null when application has no applied date', async () => {
    const user = makeUser();
    const app = makeApplication({ id: 'app-1', appliedAt: null });

    const deps = makeDeps({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
      applicationRepository: makeApplicationRepository({
        findAllByUserId: vi.fn().mockResolvedValue([app]),
      }),
      noteRepository: makeNoteRepository({ findAllByApplicationId: vi.fn().mockResolvedValue([]) }),
      documentRepository: makeDocumentRepository({
        findAllByApplicationId: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await new ExportUserDataUseCase(deps).execute('user-1');

    expect(result.applications[0].appliedAt).toBeNull();
  });

  it('fetches notes and documents in parallel per application', async () => {
    const user = makeUser();
    const apps = [makeApplication({ id: 'app-1' }), makeApplication({ id: 'app-2' })];
    const findNotes = vi.fn().mockResolvedValue([]);
    const findDocs = vi.fn().mockResolvedValue([]);

    const deps = makeDeps({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
      applicationRepository: makeApplicationRepository({
        findAllByUserId: vi.fn().mockResolvedValue(apps),
      }),
      noteRepository: makeNoteRepository({ findAllByApplicationId: findNotes }),
      documentRepository: makeDocumentRepository({ findAllByApplicationId: findDocs }),
    });

    await new ExportUserDataUseCase(deps).execute('user-1');

    expect(findNotes).toHaveBeenCalledTimes(2);
    expect(findDocs).toHaveBeenCalledTimes(2);
    expect(findNotes).toHaveBeenCalledWith('app-1');
    expect(findNotes).toHaveBeenCalledWith('app-2');
  });
});
