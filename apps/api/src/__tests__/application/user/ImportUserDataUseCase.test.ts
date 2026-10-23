import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportUserDataUseCase } from '#src/use-cases/user/ImportUserDataUseCase.js';
import { QuotaExceededError } from '#src/use-cases/errors/DomainError.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';
import {
  makeEntitlementService,
  makeFreeEntitlements,
} from '#src/__tests__/helpers/mocks/plans.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';

describe('ImportUserDataUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeDeps = (overrides?: object) => ({
    applicationRepository: makeApplicationRepository(),
    noteRepository: makeNoteRepository(),
    entitlementService: makeEntitlementService(),
    generateId: vi.fn().mockReturnValue('generated-id'),
    ...overrides,
  });

  it('holds each imported application to the importing user plan limit', async () => {
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi.fn().mockResolvedValue(makeApplication()),
      }),
      entitlementService: makeEntitlementService({
        forUserId: vi.fn().mockResolvedValue(makeFreeEntitlements()),
      }),
    });

    await new ImportUserDataUseCase(deps).execute(
      'user-7',
      JSON.stringify({ applications: [{ company: 'Acme', role: 'Engineer' }] }),
    );

    expect(deps.entitlementService.forUserId).toHaveBeenCalledWith('user-7');
    expect(deps.applicationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ applicationLimit: CONTENT_LIMITS.APPLICATIONS_PER_USER }),
    );
  });

  it('throws VALIDATION when the payload is not valid JSON', async () => {
    const deps = makeDeps();

    const err = await new ImportUserDataUseCase(deps).execute('user-1', 'not json').catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('throws VALIDATION when the payload has no applications array', async () => {
    const deps = makeDeps();

    const err = await new ImportUserDataUseCase(deps)
      .execute('user-1', JSON.stringify({ user: {} }))
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('skips entries missing company or role', async () => {
    const deps = makeDeps();
    const payload = JSON.stringify({
      applications: [{ company: 'Acme' }, { role: 'Engineer' }, {}],
    });

    const summary = await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(summary).toEqual({
      applicationsImported: 0,
      applicationsSkipped: 3,
      notesImported: 0,
      documentsSkipped: 0,
    });
    expect(deps.applicationRepository.create).not.toHaveBeenCalled();
  });

  it('skips entries with blank company or role', async () => {
    const deps = makeDeps();
    const payload = JSON.stringify({
      applications: [{ company: '  ', role: 'Engineer' }],
    });

    const summary = await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(summary.applicationsSkipped).toBe(1);
    expect(summary.applicationsImported).toBe(0);
  });

  it('imports a valid application with a recognized status', async () => {
    const app = makeApplication({ id: 'app-1' });
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi.fn().mockResolvedValue(app),
      }),
    });
    const payload = JSON.stringify({
      applications: [
        {
          company: 'Acme Corp',
          role: 'Software Engineer',
          status: 'applied',
          jobUrl: 'https://example.com/job',
          location: 'Remote',
          salaryRange: '100k-120k',
          description: 'Great role',
        },
      ],
    });

    const summary = await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(deps.applicationRepository.create).toHaveBeenCalledWith({
      id: 'generated-id',
      userId: 'user-1',
      company: 'Acme Corp',
      role: 'Software Engineer',
      status: 'applied',
      jobUrl: 'https://example.com/job',
      location: 'Remote',
      salaryRange: '100k-120k',
      description: 'Great role',
      applicationLimit: null,
    });
    expect(summary.applicationsImported).toBe(1);
    expect(summary.applicationsSkipped).toBe(0);
  });

  it('counts applications rejected by the quota as skipped records', async () => {
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi.fn().mockRejectedValue(new QuotaExceededError('application limit reached')),
      }),
    });

    const summary = await new ImportUserDataUseCase(deps).execute(
      'user-1',
      JSON.stringify({
        applications: [
          { company: 'Acme', role: 'Engineer' },
          { company: 'Globex', role: 'Engineer' },
        ],
      }),
    );

    expect(summary).toEqual({
      applicationsImported: 0,
      applicationsSkipped: 2,
      notesImported: 0,
      documentsSkipped: 0,
    });
  });

  it('falls back to the default status when status is missing or unrecognized', async () => {
    const app = makeApplication({ id: 'app-1' });
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi.fn().mockResolvedValue(app),
      }),
    });
    const payload = JSON.stringify({
      applications: [{ company: 'Acme', role: 'Engineer', status: 'not-a-real-status' }],
    });

    await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(deps.applicationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
  });

  it('normalizes empty-string optional fields to null', async () => {
    const app = makeApplication({ id: 'app-1' });
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi.fn().mockResolvedValue(app),
      }),
    });
    const payload = JSON.stringify({
      applications: [{ company: 'Acme', role: 'Engineer', jobUrl: '', location: '' }],
    });

    await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(deps.applicationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ jobUrl: null, location: null }),
    );
  });

  it('updates appliedAt when a valid date string is provided', async () => {
    const app = makeApplication({ id: 'app-1' });
    const update = vi.fn().mockResolvedValue(app);
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi.fn().mockResolvedValue(app),
        update,
      }),
    });
    const payload = JSON.stringify({
      applications: [{ company: 'Acme', role: 'Engineer', appliedAt: '2024-03-01T00:00:00.000Z' }],
    });

    await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(update).toHaveBeenCalledWith('app-1', {
      appliedAt: new Date('2024-03-01T00:00:00.000Z'),
    });
  });

  it('does not call update when appliedAt is missing or invalid', async () => {
    const app = makeApplication({ id: 'app-1' });
    const update = vi.fn().mockResolvedValue(app);
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi.fn().mockResolvedValue(app),
        update,
      }),
    });
    const payload = JSON.stringify({
      applications: [
        { company: 'Acme', role: 'Engineer', appliedAt: 'not-a-date' },
        { company: 'Beta', role: 'Engineer' },
      ],
    });

    await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(update).not.toHaveBeenCalled();
  });

  it('imports valid notes and skips blank or malformed ones', async () => {
    const app = makeApplication({ id: 'app-1' });
    const createNote = vi.fn().mockResolvedValue({});
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi.fn().mockResolvedValue(app),
      }),
      noteRepository: makeNoteRepository({ create: createNote }),
    });
    const payload = JSON.stringify({
      applications: [
        {
          company: 'Acme',
          role: 'Engineer',
          notes: [{ content: 'Great interview' }, { content: '   ' }, {}, 'not-an-object'],
        },
      ],
    });

    const summary = await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(createNote).toHaveBeenCalledTimes(1);
    expect(createNote).toHaveBeenCalledWith({
      id: 'generated-id',
      applicationId: 'app-1',
      content: 'Great interview',
    });
    expect(summary.notesImported).toBe(1);
  });

  it('counts documents as skipped without creating any records', async () => {
    const app = makeApplication({ id: 'app-1' });
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi.fn().mockResolvedValue(app),
      }),
    });
    const payload = JSON.stringify({
      applications: [
        {
          company: 'Acme',
          role: 'Engineer',
          documents: [{ name: 'cv.pdf' }, { name: 'cover.pdf' }],
        },
      ],
    });

    const summary = await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(summary.documentsSkipped).toBe(2);
  });

  it('processes multiple applications and aggregates the summary', async () => {
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        create: vi
          .fn()
          .mockResolvedValueOnce(makeApplication({ id: 'app-1' }))
          .mockResolvedValueOnce(makeApplication({ id: 'app-2' })),
      }),
    });
    const payload = JSON.stringify({
      applications: [
        { company: 'Acme', role: 'Engineer' },
        { company: '', role: 'Engineer' },
        { company: 'Globex', role: 'Manager' },
      ],
    });

    const summary = await new ImportUserDataUseCase(deps).execute('user-1', payload);

    expect(summary.applicationsImported).toBe(2);
    expect(summary.applicationsSkipped).toBe(1);
  });
});
