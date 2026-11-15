import { describe, it, expect, vi } from 'vitest';
import { CreateProjectUseCase } from '#src/use-cases/project/CreateProjectUseCase.js';
import { UpdateProjectUseCase } from '#src/use-cases/project/UpdateProjectUseCase.js';
import { DeleteProjectUseCase } from '#src/use-cases/project/DeleteProjectUseCase.js';
import { CreateAwardUseCase } from '#src/use-cases/award/CreateAwardUseCase.js';
import { UpdateAwardUseCase } from '#src/use-cases/award/UpdateAwardUseCase.js';
import { DeleteAwardUseCase } from '#src/use-cases/award/DeleteAwardUseCase.js';
import { CONTENT_LIMITS, PROFILE_ENTRY } from '#src/use-cases/constants.js';
import {
  NotFoundError,
  QuotaExceededError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import {
  makeAward,
  makeAwardRepository,
  makeProject,
  makeProjectRepository,
} from '#src/__tests__/helpers/mocks/profile.js';

const generateId = () => 'new-id';

describe('projects (JEF-592)', () => {
  it('creates one with trimmed text, blank optional fields as null, and a checked link', async () => {
    const repo = makeProjectRepository({ create: vi.fn().mockResolvedValue(makeProject()) });
    await new CreateProjectUseCase({ projectRepository: repo, generateId }).execute({
      userId: 'user-1',
      name: '  Trakwyn  ',
      role: '   ',
      url: ' https://example.com/trakwyn ',
      startDate: new Date('2023-01-01'),
      description: '  Built a job tracker.  ',
    });

    expect(repo.create).toHaveBeenCalledWith({
      id: 'new-id',
      userId: 'user-1',
      name: 'Trakwyn',
      role: null,
      url: 'https://example.com/trakwyn',
      startDate: new Date('2023-01-01'),
      endDate: null,
      description: 'Built a job tracker.',
    });
  });

  it('refuses a blank name, a link that is not http(s) and an over-long description', async () => {
    const useCase = new CreateProjectUseCase({
      projectRepository: makeProjectRepository(),
      generateId,
    });
    await expect(useCase.execute({ userId: 'u', name: ' ' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      useCase.execute({ userId: 'u', name: 'P', url: 'ftp://example.com' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.execute({
        userId: 'u',
        name: 'P',
        description: 'x'.repeat(PROFILE_ENTRY.DESCRIPTION_MAX_CHARS + 1),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a new one past the per-user cap', async () => {
    const repo = makeProjectRepository({
      findAllByUserId: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: CONTENT_LIMITS.PROJECTS_PER_USER }, () => makeProject()),
        ),
    });
    await expect(
      new CreateProjectUseCase({ projectRepository: repo, generateId }).execute({
        userId: 'user-1',
        name: 'P',
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('updates only what was sent, clears a field sent as null, and refuses another user’s entry', async () => {
    const own = makeProjectRepository({
      findById: vi.fn().mockResolvedValue(makeProject()),
      update: vi.fn().mockResolvedValue(makeProject()),
    });
    await new UpdateProjectUseCase({ projectRepository: own }).execute({
      id: 'proj-1',
      userId: 'user-1',
      endDate: null,
      role: ' Lead ',
    });
    expect(own.update).toHaveBeenCalledWith('proj-1', { endDate: null, role: 'Lead' });

    const foreign = makeProjectRepository({
      findById: vi.fn().mockResolvedValue(makeProject({ userId: 'other' })),
    });
    await expect(
      new UpdateProjectUseCase({ projectRepository: foreign }).execute({
        id: 'proj-1',
        userId: 'user-1',
        name: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      new DeleteProjectUseCase({ projectRepository: foreign }).execute({
        id: 'proj-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(foreign.delete).not.toHaveBeenCalled();
  });

  it('deletes an entry the user owns', async () => {
    const repo = makeProjectRepository({ findById: vi.fn().mockResolvedValue(makeProject()) });
    await new DeleteProjectUseCase({ projectRepository: repo }).execute({
      id: 'proj-1',
      userId: 'user-1',
    });
    expect(repo.delete).toHaveBeenCalledWith('proj-1', 'user-1');
  });
});

describe('awards (JEF-592)', () => {
  it('creates one with a trimmed title', async () => {
    const repo = makeAwardRepository({ create: vi.fn().mockResolvedValue(makeAward()) });
    await new CreateAwardUseCase({ awardRepository: repo, generateId }).execute({
      userId: 'user-1',
      title: ' Dean’s List ',
      issuer: 'State University',
      date: new Date('2018-05-01'),
    });
    expect(repo.create).toHaveBeenCalledWith({
      id: 'new-id',
      userId: 'user-1',
      title: 'Dean’s List',
      issuer: 'State University',
      date: new Date('2018-05-01'),
      description: null,
    });
  });

  it('refuses a blank title and a new one past the cap', async () => {
    await expect(
      new CreateAwardUseCase({ awardRepository: makeAwardRepository(), generateId }).execute({
        userId: 'u',
        title: '',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const full = makeAwardRepository({
      findAllByUserId: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: CONTENT_LIMITS.AWARDS_PER_USER }, () => makeAward()),
        ),
    });
    await expect(
      new CreateAwardUseCase({ awardRepository: full, generateId }).execute({
        userId: 'u',
        title: 'A',
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('updates, and refuses another user’s entry', async () => {
    const own = makeAwardRepository({
      findById: vi.fn().mockResolvedValue(makeAward()),
      update: vi.fn().mockResolvedValue(makeAward()),
    });
    await new UpdateAwardUseCase({ awardRepository: own }).execute({
      id: 'award-1',
      userId: 'user-1',
      issuer: null,
    });
    expect(own.update).toHaveBeenCalledWith('award-1', { issuer: null });

    const foreign = makeAwardRepository({
      findById: vi.fn().mockResolvedValue(makeAward({ userId: 'other' })),
    });
    await expect(
      new DeleteAwardUseCase({ awardRepository: foreign }).execute({
        id: 'award-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
