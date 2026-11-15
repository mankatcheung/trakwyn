import { describe, it, expect, vi } from 'vitest';
import { ParseCvUseCase } from '#src/use-cases/profile/ParseCvUseCase.js';
import { ImportCvProfileUseCase } from '#src/use-cases/profile/ImportCvProfileUseCase.js';
import type { ImportCvProfileInput } from '#src/use-cases/profile/IImportCvProfileUseCase.js';
import {
  makeRateLimiter,
  makeTransactionManager,
} from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeLLMProvider, makeLLMProviderFactory } from '#src/__tests__/helpers/mocks/llm.js';
import { makeDocumentTextExtractor } from '#src/__tests__/helpers/mocks/documents.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import {
  makeAward,
  makeAwardRepository,
  makeCertification,
  makeCertificationRepository,
  makeEducationRepository,
  makeLanguage,
  makeLanguageRepository,
  makeProject,
  makeProjectRepository,
  makeSkillRepository,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';
import { CONTENT_LIMITS, CV_IMPORT, MIME_TYPE } from '#src/use-cases/constants.js';
import { QuotaExceededError, ValidationError } from '#src/use-cases/errors/DomainError.js';

const reply = {
  certifications: [
    {
      name: ' AWS Certified Solutions Architect ',
      issuer: 'Amazon Web Services',
      issuedAt: '2022-03',
      expiresAt: '2021-01',
      credentialUrl: 'https://example.com/aws',
    },
    { name: 'AWS Certified Solutions Architect' },
    { name: '' },
  ],
  languages: [{ name: 'French', proficiency: 'Fluent' }, { name: '   ' }],
  projects: [
    {
      name: 'Open-source CLI',
      role: 'Maintainer',
      url: 'javascript:alert(1)',
      startDate: '2021',
      endDate: 'Present',
      description: 'Maintained a CLI used by 2,000 developers.',
    },
    { name: 'No dates', endDate: '2023-01' },
  ],
  awards: [
    { title: 'Engineering Excellence Award', issuer: 'Acme', date: '2022-06' },
    { title: null },
  ],
};

function buildParse(over: Record<string, unknown> = {}) {
  const provider = makeLLMProvider(JSON.stringify(reply));
  const deps = {
    llmProviderFactory: makeLLMProviderFactory({ forUser: vi.fn().mockResolvedValue(provider) }),
    documentTextExtractor: makeDocumentTextExtractor({
      extract: vi.fn().mockResolvedValue('Jane Doe — CV text'),
    }),
    workExperienceRepository: makeWorkExperienceRepository(),
    educationRepository: makeEducationRepository(),
    skillRepository: makeSkillRepository(),
    certificationRepository: makeCertificationRepository(),
    languageRepository: makeLanguageRepository(),
    projectRepository: makeProjectRepository(),
    awardRepository: makeAwardRepository(),
    parseCvRateLimiter: makeRateLimiter(),
    ...over,
  };
  return { deps, useCase: new ParseCvUseCase(deps) };
}

const parse = (useCase: ParseCvUseCase) =>
  useCase.execute({
    userId: 'user-1',
    buffer: Buffer.from('%PDF-1.7\nbody'),
    mimeType: MIME_TYPE.PDF,
  });

describe('CV import: certifications, languages, projects and awards (JEF-592)', () => {
  describe('reading the CV', () => {
    it('keeps what is usable, drops blanks and repeats, and cleans each field', async () => {
      const result = await parse(buildParse().useCase);

      expect(result.certifications).toEqual([
        {
          name: 'AWS Certified Solutions Architect',
          issuer: 'Amazon Web Services',
          issuedAt: '2022-03',
          // Expiring before it was issued is a misreading.
          expiresAt: null,
          credentialUrl: 'https://example.com/aws',
          alreadyInProfile: false,
        },
      ]);
      expect(result.languages).toEqual([
        { name: 'French', proficiency: 'Fluent', alreadyInProfile: false },
      ]);
      expect(result.awards).toEqual([
        {
          title: 'Engineering Excellence Award',
          issuer: 'Acme',
          date: '2022-06',
          description: null,
          alreadyInProfile: false,
        },
      ]);
    });

    it('drops a link that is not http(s), and an end date with no start to check it against', async () => {
      const { projects } = await parse(buildParse().useCase);

      expect(projects).toEqual([
        {
          name: 'Open-source CLI',
          role: 'Maintainer',
          url: null,
          startDate: '2021-01',
          endDate: null,
          description: 'Maintained a CLI used by 2,000 developers.',
          alreadyInProfile: false,
        },
        {
          name: 'No dates',
          role: null,
          url: null,
          startDate: null,
          endDate: null,
          description: null,
          alreadyInProfile: false,
        },
      ]);
    });

    it('flags entries the profile already holds, by name and ignoring case', async () => {
      const { useCase } = buildParse({
        certificationRepository: makeCertificationRepository({
          findAllByUserId: vi
            .fn()
            .mockResolvedValue([makeCertification({ name: 'aws certified solutions architect' })]),
        }),
        languageRepository: makeLanguageRepository({
          findAllByUserId: vi.fn().mockResolvedValue([makeLanguage({ name: 'FRENCH' })]),
        }),
        projectRepository: makeProjectRepository({
          findAllByUserId: vi.fn().mockResolvedValue([makeProject({ name: 'open-source cli' })]),
        }),
        awardRepository: makeAwardRepository({
          findAllByUserId: vi
            .fn()
            .mockResolvedValue([makeAward({ title: 'engineering excellence award' })]),
        }),
      });

      const result = await parse(useCase);

      expect(result.certifications[0]!.alreadyInProfile).toBe(true);
      expect(result.languages[0]!.alreadyInProfile).toBe(true);
      expect(result.projects[0]!.alreadyInProfile).toBe(true);
      expect(result.awards[0]!.alreadyInProfile).toBe(true);
      expect(result.projects[1]!.alreadyInProfile).toBe(false);
    });

    it('treats a CV with none of the sections as empty lists', async () => {
      const provider = makeLLMProvider(JSON.stringify({ skills: [] }));
      const { useCase } = buildParse({
        llmProviderFactory: makeLLMProviderFactory({
          forUser: vi.fn().mockResolvedValue(provider),
        }),
      });

      const result = await parse(useCase);

      expect(result).toMatchObject({ certifications: [], languages: [], projects: [], awards: [] });
    });

    it('caps each section at its import limit', async () => {
      const many = (n: number, key: string) =>
        Array.from({ length: n }, (_, i) => ({ [key]: `Item ${i}` }));
      const provider = makeLLMProvider(
        JSON.stringify({
          certifications: many(CV_IMPORT.MAX_CERTIFICATIONS + 5, 'name'),
          languages: many(CV_IMPORT.MAX_LANGUAGES + 5, 'name'),
          projects: many(CV_IMPORT.MAX_PROJECTS + 5, 'name'),
          awards: many(CV_IMPORT.MAX_AWARDS + 5, 'title'),
        }),
      );
      const { useCase } = buildParse({
        llmProviderFactory: makeLLMProviderFactory({
          forUser: vi.fn().mockResolvedValue(provider),
        }),
      });

      const result = await parse(useCase);

      expect(result.certifications).toHaveLength(CV_IMPORT.MAX_CERTIFICATIONS);
      expect(result.languages).toHaveLength(CV_IMPORT.MAX_LANGUAGES);
      expect(result.projects).toHaveLength(CV_IMPORT.MAX_PROJECTS);
      expect(result.awards).toHaveLength(CV_IMPORT.MAX_AWARDS);
    });
  });

  describe('saving what the user ticked', () => {
    function buildImport() {
      let n = 0;
      const echo = () => vi.fn().mockImplementation(async (data) => data);
      const deps = {
        workExperienceRepository: makeWorkExperienceRepository(),
        educationRepository: makeEducationRepository(),
        skillRepository: makeSkillRepository(),
        certificationRepository: makeCertificationRepository({ create: echo() }),
        languageRepository: makeLanguageRepository({ create: echo() }),
        projectRepository: makeProjectRepository({ create: echo() }),
        awardRepository: makeAwardRepository({ create: echo() }),
        userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
        transactionManager: makeTransactionManager(),
        generateId: () => `id-${++n}`,
      };
      return { deps, useCase: new ImportCvProfileUseCase(deps) };
    }

    const input = (over: Partial<ImportCvProfileInput> = {}): ImportCvProfileInput => ({
      userId: 'user-1',
      workExperiences: [],
      educations: [],
      skills: [],
      ...over,
    });

    it('creates each entry for the user, trims text, and returns the counts', async () => {
      const { deps, useCase } = buildImport();

      const result = await useCase.execute(
        input({
          certifications: [
            {
              name: ' CKA ',
              issuer: ' CNCF ',
              issuedAt: new Date('2023-05-01T00:00:00Z'),
              credentialUrl: ' https://example.com/cka ',
            },
          ],
          languages: [{ name: ' French ', proficiency: ' ' }],
          projects: [
            {
              name: 'CLI',
              startDate: new Date('2021-03-01T00:00:00Z'),
              description: ' Built it. ',
            },
          ],
          awards: [{ title: 'Dean’s List', date: new Date('2018-05-01T00:00:00Z') }],
        }),
      );

      expect(result).toMatchObject({ certifications: 1, languages: 1, projects: 1, awards: 1 });
      expect(deps.certificationRepository.create).toHaveBeenCalledWith({
        id: 'id-1',
        userId: 'user-1',
        name: 'CKA',
        issuer: 'CNCF',
        issuedAt: new Date('2023-05-01T00:00:00Z'),
        expiresAt: null,
        credentialUrl: 'https://example.com/cka',
      });
      expect(deps.languageRepository.create).toHaveBeenCalledWith({
        id: 'id-2',
        userId: 'user-1',
        name: 'French',
        proficiency: null,
      });
      expect(deps.projectRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'CLI', endDate: null, description: 'Built it.' }),
      );
      expect(deps.awardRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Dean’s List', issuer: null }),
      );
    });

    it('still works for a client that sends none of the new sections', async () => {
      const { useCase } = buildImport();
      const result = await useCase.execute(input({ skills: [{ name: 'Go' }] }));
      expect(result).toMatchObject({
        skills: 1,
        certifications: 0,
        languages: 0,
        projects: 0,
        awards: 0,
      });
    });

    it('counts a CV of only the new sections as something to import', async () => {
      const { useCase } = buildImport();
      await expect(
        useCase.execute(input({ languages: [{ name: 'French' }] })),
      ).resolves.toMatchObject({
        languages: 1,
      });
      await expect(useCase.execute(input())).rejects.toThrow('Select at least one item to import');
    });

    it('refuses an entry the user edited into something invalid, before writing anything', async () => {
      const { deps, useCase } = buildImport();

      await expect(
        useCase.execute(
          input({
            languages: [{ name: 'French' }],
            certifications: [{ name: 'CKA', credentialUrl: 'ftp://example.com' }],
          }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(useCase.execute(input({ awards: [{ title: '  ' }] }))).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(
        useCase.execute(
          input({
            projects: [
              {
                name: 'P',
                startDate: new Date('2023-01-01T00:00:00Z'),
                endDate: new Date('2022-01-01T00:00:00Z'),
              },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(deps.languageRepository.create).not.toHaveBeenCalled();
    });

    it('refuses a section that is too long to import, or would pass the per-user cap', async () => {
      const { deps, useCase } = buildImport();
      await expect(
        useCase.execute(
          input({
            languages: Array.from({ length: CV_IMPORT.MAX_LANGUAGES + 1 }, (_, i) => ({
              name: `L${i}`,
            })),
          }),
        ),
      ).rejects.toThrow(/Too many languages/);

      deps.projectRepository.findAllByUserId = vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: CONTENT_LIMITS.PROJECTS_PER_USER }, () => makeProject()),
        );
      await expect(
        useCase.execute(input({ projects: [{ name: 'One too many' }] })),
      ).rejects.toBeInstanceOf(QuotaExceededError);
      expect(deps.projectRepository.create).not.toHaveBeenCalled();
    });
  });
});
