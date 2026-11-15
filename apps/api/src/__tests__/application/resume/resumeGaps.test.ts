import { describe, expect, it, vi } from 'vitest';
import {
  findResumeGaps,
  normaliseGapKey,
  requirementGapKey,
  roleGapKey,
} from '#src/use-cases/resume/resumeGaps.js';
import { GetResumeGapsUseCase } from '#src/use-cases/resume/GetResumeGapsUseCase.js';
import { DismissResumeGapUseCase } from '#src/use-cases/resume/DismissResumeGapUseCase.js';
import type { UserProfile } from '#src/use-cases/shared/userProfile.js';
import {
  makeApplication,
  makeApplicationRepository,
  makePostingRequirements,
  makePostingRequirementsRepository,
  makeResumeGapDismissalRepository,
} from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeEducationRepository,
  makeSkill,
  makeSkillRepository,
  makeWorkExperience,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';

const current = makeWorkExperience({
  id: 'we-current',
  company: 'Acme',
  title: 'Engineer',
  startDate: new Date('2021-03-01T00:00:00Z'),
  endDate: null,
  description: 'Ran the Kubernetes platform and wrote Go services.',
});
const older = makeWorkExperience({
  id: 'we-older',
  company: 'Globex',
  title: 'Developer',
  startDate: new Date('2017-01-01T00:00:00Z'),
  endDate: new Date('2021-02-01T00:00:00Z'),
  description: 'Cut build time by 40% for a team of 6.',
});
const oldest = makeWorkExperience({
  id: 'we-oldest',
  company: 'Initech',
  title: 'Intern',
  startDate: new Date('2015-06-01T00:00:00Z'),
  endDate: new Date('2015-09-01T00:00:00Z'),
  description: null,
});

const profileOf = (over: Partial<UserProfile> = {}): UserProfile => ({
  workExperiences: [oldest, older, current],
  educations: [],
  skills: [makeSkill({ id: 's1', name: 'TypeScript' }), makeSkill({ id: 's2', name: 'Postgres' })],
  ...over,
});

describe('findResumeGaps requirements (JEF-594)', () => {
  it('asks only about keywords the profile neither lists nor mentions', () => {
    const gaps = findResumeGaps({
      keywords: ['TypeScript', 'PostgreSQL', 'Kubernetes', 'Terraform', 'Kafka'],
      profile: profileOf(),
      dismissedKeys: [],
    });

    // TypeScript is listed, PostgreSQL is an alias of a listed skill, Kubernetes is in a description.
    expect(gaps.requirementGaps).toEqual(['Terraform', 'Kafka']);
    expect(gaps.requirementsRead).toBe(true);
  });

  it('does not ask again about one the user said no to, whatever its case', () => {
    const gaps = findResumeGaps({
      keywords: ['Terraform', 'Kafka'],
      profile: profileOf(),
      dismissedKeys: [requirementGapKey(' terraform ')],
    });

    expect(gaps.requirementGaps).toEqual(['Kafka']);
  });

  it('asks about at most eight, in the posting’s order', () => {
    const keywords = Array.from({ length: 20 }, (_, i) => `Tool-${i}`);

    const gaps = findResumeGaps({ keywords, profile: profileOf(), dismissedKeys: [] });

    expect(gaps.requirementGaps).toEqual(keywords.slice(0, 8));
  });

  it('says so when the posting has not been read, and still looks at the roles', () => {
    const gaps = findResumeGaps({ keywords: null, profile: profileOf(), dismissedKeys: [] });

    expect(gaps.requirementsRead).toBe(false);
    expect(gaps.requirementGaps).toEqual([]);
    expect(gaps.rolesWithoutMetrics.length).toBeGreaterThan(0);
  });
});

describe('findResumeGaps roles without numbers (JEF-594)', () => {
  it('lists roles with no figure in the description, most recent first', () => {
    const gaps = findResumeGaps({ keywords: [], profile: profileOf(), dismissedKeys: [] });

    expect(gaps.rolesWithoutMetrics).toEqual([
      {
        workExperienceId: 'we-current',
        company: 'Acme',
        title: 'Engineer',
        description: 'Ran the Kubernetes platform and wrote Go services.',
      },
      { workExperienceId: 'we-oldest', company: 'Initech', title: 'Intern', description: null },
    ]);
  });

  it('leaves out a role the user declined, and lists at most three', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      makeWorkExperience({
        id: `we-${i}`,
        company: `Co ${i}`,
        startDate: new Date(`20${10 + i}-01-01T00:00:00Z`),
        endDate: new Date(`20${11 + i}-01-01T00:00:00Z`),
        description: 'No figures here.',
      }),
    );

    const gaps = findResumeGaps({
      keywords: [],
      profile: profileOf({ workExperiences: many }),
      dismissedKeys: [roleGapKey('we-4')],
    });

    expect(gaps.rolesWithoutMetrics.map((role) => role.workExperienceId)).toEqual([
      'we-3',
      'we-2',
      'we-1',
    ]);
  });
});

describe('normaliseGapKey', () => {
  it('lower-cases a requirement and leaves a role key as it is', () => {
    expect(normaliseGapKey('  Apache   Kafka ')).toBe('apache kafka');
    expect(normaliseGapKey(' role:we-ABC ')).toBe('role:we-ABC');
  });
});

function profileRepositories(profile: UserProfile) {
  return {
    workExperienceRepository: makeWorkExperienceRepository({
      findAllByUserId: vi.fn().mockResolvedValue(profile.workExperiences),
    }),
    educationRepository: makeEducationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(profile.educations),
    }),
    skillRepository: makeSkillRepository({
      findAllByUserId: vi.fn().mockResolvedValue(profile.skills),
    }),
  };
}

describe('GetResumeGapsUseCase', () => {
  const build = (over: {
    app?: ReturnType<typeof makeApplication> | null;
    requirements?: ReturnType<typeof makePostingRequirements> | null;
    dismissed?: string[];
  }) =>
    new GetResumeGapsUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(over.app === undefined ? makeApplication() : over.app),
      }),
      postingRequirementsRepository: makePostingRequirementsRepository({
        findByApplicationId: vi.fn().mockResolvedValue(over.requirements ?? null),
      }),
      resumeGapDismissalRepository: makeResumeGapDismissalRepository({
        findKeysByApplicationId: vi.fn().mockResolvedValue(over.dismissed ?? []),
      }),
      ...profileRepositories(profileOf()),
    });
  const input = { userId: 'user-1', applicationId: 'app-1' };

  it('compares the saved posting keywords with the profile', async () => {
    const gaps = await build({
      requirements: makePostingRequirements({ keywords: ['TypeScript', 'Terraform', 'Kafka'] }),
      dismissed: ['kafka'],
    }).execute(input);

    expect(gaps.requirementsRead).toBe(true);
    expect(gaps.requirementGaps).toEqual(['Terraform']);
    expect(gaps.rolesWithoutMetrics.map((role) => role.workExperienceId)).toEqual([
      'we-current',
      'we-oldest',
    ]);
  });

  it('has no requirement questions before the posting is read', async () => {
    const gaps = await build({ requirements: null }).execute(input);

    expect(gaps).toMatchObject({ requirementsRead: false, requirementGaps: [] });
  });

  it('is NOT_FOUND for a missing application and FORBIDDEN for someone else’s', async () => {
    await expect(build({ app: null }).execute(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      build({ app: makeApplication({ userId: 'someone-else' }) }).execute(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('DismissResumeGapUseCase', () => {
  const remaining = { requirementsRead: true, requirementGaps: ['Kafka'], rolesWithoutMetrics: [] };
  const build = (over: { app?: ReturnType<typeof makeApplication> | null; count?: number }) => {
    const resumeGapDismissalRepository = makeResumeGapDismissalRepository({
      countByApplicationId: vi.fn().mockResolvedValue(over.count ?? 0),
    });
    const getResumeGapsUseCase = { execute: vi.fn().mockResolvedValue(remaining) };
    const useCase = new DismissResumeGapUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(over.app === undefined ? makeApplication() : over.app),
      }),
      resumeGapDismissalRepository,
      getResumeGapsUseCase,
      generateId: () => 'dismissal-1',
    });
    return { useCase, resumeGapDismissalRepository, getResumeGapsUseCase };
  };
  const input = { userId: 'user-1', applicationId: 'app-1' };

  it('saves the answer under its normalised key and returns what is left', async () => {
    const ctx = build({});

    const result = await ctx.useCase.execute({ ...input, key: '  Terraform ' });

    expect(ctx.resumeGapDismissalRepository.add).toHaveBeenCalledWith({
      id: 'dismissal-1',
      applicationId: 'app-1',
      key: 'terraform',
    });
    expect(result).toEqual(remaining);
  });

  it('keeps a role key as sent', async () => {
    const ctx = build({});

    await ctx.useCase.execute({ ...input, key: 'role:we-Current' });

    expect(ctx.resumeGapDismissalRepository.add).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'role:we-Current' }),
    );
  });

  it('refuses an empty or over-long key, and a 201st dismissal', async () => {
    await expect(build({}).useCase.execute({ ...input, key: '   ' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      build({}).useCase.execute({ ...input, key: 'x'.repeat(201) }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const full = build({ count: 200 });
    await expect(full.useCase.execute({ ...input, key: 'Terraform' })).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    expect(full.resumeGapDismissalRepository.add).not.toHaveBeenCalled();
  });

  it('is NOT_FOUND for a missing application and FORBIDDEN for someone else’s, saving nothing', async () => {
    const missing = build({ app: null });
    await expect(missing.useCase.execute({ ...input, key: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const foreign = build({ app: makeApplication({ userId: 'someone-else' }) });
    await expect(foreign.useCase.execute({ ...input, key: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(foreign.resumeGapDismissalRepository.add).not.toHaveBeenCalled();
  });
});
