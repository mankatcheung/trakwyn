import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportCvProfileUseCase } from '#src/use-cases/profile/ImportCvProfileUseCase.js';
import type { ImportCvProfileInput } from '#src/use-cases/profile/IImportCvProfileUseCase.js';
import { makeTransactionManager } from '#src/__tests__/helpers/mocks/infrastructure.js';
import {
  makeEducationRepository,
  makeSkillRepository,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { CV_IMPORT } from '#src/use-cases/constants.js';

function build() {
  let n = 0;
  const deps = {
    workExperienceRepository: makeWorkExperienceRepository({
      create: vi.fn().mockImplementation(async (data) => data),
    }),
    educationRepository: makeEducationRepository({
      create: vi.fn().mockImplementation(async (data) => data),
    }),
    skillRepository: makeSkillRepository({
      create: vi.fn().mockImplementation(async (data) => data),
    }),
    transactionManager: makeTransactionManager(),
    generateId: () => `id-${++n}`,
  };
  return { deps, useCase: new ImportCvProfileUseCase(deps) };
}

const input = (overrides: Partial<ImportCvProfileInput> = {}): ImportCvProfileInput => ({
  userId: 'user-1',
  workExperiences: [
    {
      company: 'Acme Corp',
      title: 'Engineer',
      location: 'Remote',
      startDate: new Date('2020-03-01T00:00:00Z'),
      endDate: null,
      description: 'Built things.',
    },
  ],
  educations: [
    {
      institution: 'UC Berkeley',
      degree: 'B.S.',
      field: 'Computer Science',
      startDate: new Date('2012-01-01T00:00:00Z'),
      endDate: new Date('2016-01-01T00:00:00Z'),
    },
  ],
  skills: [{ name: 'TypeScript', category: 'Language' }],
  ...overrides,
});

describe('ImportCvProfileUseCase', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
  });

  it('creates every entry for the user and returns the counts', async () => {
    const result = await ctx.useCase.execute(input());

    expect(result).toEqual({ workExperiences: 1, educations: 1, skills: 1 });
    expect(ctx.deps.workExperienceRepository.create).toHaveBeenCalledWith({
      id: 'id-1',
      userId: 'user-1',
      company: 'Acme Corp',
      title: 'Engineer',
      location: 'Remote',
      startDate: new Date('2020-03-01T00:00:00Z'),
      endDate: null,
      description: 'Built things.',
    });
    expect(ctx.deps.educationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', institution: 'UC Berkeley', description: null }),
    );
    expect(ctx.deps.skillRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', name: 'TypeScript', proficiency: null }),
    );
  });

  it('gives each record its own id', async () => {
    await ctx.useCase.execute(input());
    const ids = [
      vi.mocked(ctx.deps.workExperienceRepository.create).mock.calls[0]![0].id,
      vi.mocked(ctx.deps.educationRepository.create).mock.calls[0]![0].id,
      vi.mocked(ctx.deps.skillRepository.create).mock.calls[0]![0].id,
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it('runs all the writes in one transaction', async () => {
    await ctx.useCase.execute(input());
    expect(ctx.deps.transactionManager.run).toHaveBeenCalledTimes(1);
  });

  it('imports only the sections it is given', async () => {
    const result = await ctx.useCase.execute(
      input({ workExperiences: [], educations: [], skills: [{ name: 'Go' }] }),
    );
    expect(result).toEqual({ workExperiences: 0, educations: 0, skills: 1 });
    expect(ctx.deps.workExperienceRepository.create).not.toHaveBeenCalled();
  });

  it('trims text and stores blanks as null', async () => {
    await ctx.useCase.execute(
      input({
        workExperiences: [
          {
            company: '  Acme  ',
            title: ' Dev ',
            location: '  ',
            startDate: new Date('2020-01-01T00:00:00Z'),
            description: '',
          },
        ],
        educations: [],
        skills: [],
      }),
    );
    expect(ctx.deps.workExperienceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        company: 'Acme',
        title: 'Dev',
        location: null,
        endDate: null,
        description: null,
      }),
    );
  });

  describe('refusing a bad request', () => {
    const refuses = async (overrides: Partial<ImportCvProfileInput>, message?: RegExp) => {
      const promise = ctx.useCase.execute(input(overrides));
      await expect(promise).rejects.toThrow(ValidationError);
      if (message) await expect(promise).rejects.toThrow(message);
      expect(ctx.deps.workExperienceRepository.create).not.toHaveBeenCalled();
      expect(ctx.deps.educationRepository.create).not.toHaveBeenCalled();
      expect(ctx.deps.skillRepository.create).not.toHaveBeenCalled();
    };

    it('needs at least one entry', async () => {
      await refuses({ workExperiences: [], educations: [], skills: [] }, /at least one/i);
    });

    it('needs a company and a title', async () => {
      const start = new Date('2020-01-01T00:00:00Z');
      await refuses({ workExperiences: [{ company: ' ', title: 'Dev', startDate: start }] });
      await refuses({ workExperiences: [{ company: 'Acme', title: '', startDate: start }] });
    });

    it('needs an institution', async () => {
      await refuses({ educations: [{ institution: '  ', startDate: new Date('2010-01-01') }] });
    });

    it('needs a skill name', async () => {
      await refuses({ skills: [{ name: '   ' }] });
    });

    it('refuses a date that is not a date', async () => {
      await refuses({
        workExperiences: [{ company: 'A', title: 'B', startDate: new Date('not a date') }],
      });
    });

    it('refuses a date outside the believable years', async () => {
      await refuses({
        workExperiences: [{ company: 'A', title: 'B', startDate: new Date('1850-01-01') }],
      });
      await refuses({
        workExperiences: [{ company: 'A', title: 'B', startDate: new Date('2500-01-01') }],
      });
    });

    it('refuses an end date before the start date', async () => {
      await refuses(
        {
          workExperiences: [
            {
              company: 'A',
              title: 'B',
              startDate: new Date('2020-06-01'),
              endDate: new Date('2019-01-01'),
            },
          ],
        },
        /end date/i,
      );
    });

    it('refuses a field that is too long', async () => {
      await refuses({
        skills: [{ name: 'x'.repeat(CV_IMPORT.SHORT_FIELD_MAX_CHARS + 1) }],
      });
      await refuses({
        educations: [
          {
            institution: 'Uni',
            startDate: new Date('2010-01-01'),
            description: 'd'.repeat(CV_IMPORT.DESCRIPTION_MAX_CHARS + 1),
          },
        ],
      });
    });

    it('refuses more entries than a CV import can hold', async () => {
      await refuses({
        skills: Array.from({ length: CV_IMPORT.MAX_SKILLS + 1 }, (_, i) => ({ name: `S${i}` })),
      });
    });

    it('checks every section before writing any, so a late error leaves nothing behind', async () => {
      await refuses({ skills: [{ name: '' }] });
    });
  });

  it('lets a failed write propagate so the transaction rolls back', async () => {
    ctx.deps.skillRepository.create = vi.fn().mockRejectedValue(new Error('db down'));
    await expect(ctx.useCase.execute(input())).rejects.toThrow('db down');
  });

  it('works without a transaction manager, as the other multi-write use cases do', async () => {
    const useCase = new ImportCvProfileUseCase({ ...ctx.deps, transactionManager: undefined });
    await expect(useCase.execute(input())).resolves.toEqual({
      workExperiences: 1,
      educations: 1,
      skills: 1,
    });
    expect(ctx.deps.transactionManager.run).not.toHaveBeenCalled();
  });
});
