import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParseCvUseCase } from '#src/use-cases/profile/ParseCvUseCase.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeLLMProvider, makeLLMProviderFactory } from '#src/__tests__/helpers/mocks/llm.js';
import { makeDocumentTextExtractor } from '#src/__tests__/helpers/mocks/documents.js';
import {
  makeEducation,
  makeEducationRepository,
  makeSkill,
  makeSkillRepository,
  makeWorkExperience,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';
import {
  AiNotConfiguredError,
  AiResponseInvalidError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import { AI_PROMPT_INPUT, CV_IMPORT, LLM, MIME_TYPE } from '#src/use-cases/constants.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

const pdfBuffer = Buffer.from('%PDF-1.7\nbody');

const aiReply = {
  workExperiences: [
    {
      company: 'Acme Corp',
      title: 'Senior Engineer',
      location: 'Remote',
      startDate: '2020-03',
      endDate: 'Present',
      description: 'Built distributed systems.',
    },
  ],
  educations: [
    {
      institution: 'UC Berkeley',
      degree: 'B.S.',
      field: 'Computer Science',
      startDate: '2012',
      endDate: '2016',
      description: null,
    },
  ],
  skills: [{ name: 'TypeScript', category: 'Language', proficiency: 'expert' }],
};

function build(reply: unknown = aiReply, extractedText = 'Jane Doe — CV text') {
  const provider = makeLLMProvider(typeof reply === 'string' ? reply : JSON.stringify(reply));
  const deps = {
    llmProviderFactory: makeLLMProviderFactory({ forUser: vi.fn().mockResolvedValue(provider) }),
    documentTextExtractor: makeDocumentTextExtractor({
      extract: vi.fn().mockResolvedValue(extractedText),
    }),
    workExperienceRepository: makeWorkExperienceRepository(),
    educationRepository: makeEducationRepository(),
    skillRepository: makeSkillRepository(),
    parseCvRateLimiter: makeRateLimiter(),
  };
  return { deps, provider, useCase: new ParseCvUseCase(deps) };
}

const run = (useCase: ParseCvUseCase) =>
  useCase.execute({ userId: 'user-1', buffer: pdfBuffer, mimeType: MIME_TYPE.PDF });

describe('ParseCvUseCase', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
  });

  it('turns the model reply into work experience, education and skills', async () => {
    const result = await run(ctx.useCase);

    expect(result.workExperiences).toEqual([
      {
        company: 'Acme Corp',
        title: 'Senior Engineer',
        location: 'Remote',
        startDate: '2020-03',
        endDate: null,
        description: 'Built distributed systems.',
        alreadyInProfile: false,
      },
    ]);
    expect(result.educations[0]).toMatchObject({
      institution: 'UC Berkeley',
      startDate: '2012-01',
      endDate: '2016-01',
      description: null,
    });
    expect(result.skills).toEqual([
      { name: 'TypeScript', category: 'Language', proficiency: 'expert', alreadyInProfile: false },
    ]);
    expect(result.truncated).toBe(false);
  });

  it('reads the file with the extractor for its declared type', async () => {
    await run(ctx.useCase);
    expect(ctx.deps.documentTextExtractor.extract).toHaveBeenCalledWith(pdfBuffer, MIME_TYPE.PDF);
  });

  it('asks for the full output budget, since the default cuts off an ordinary CV', async () => {
    await run(ctx.useCase);
    expect(vi.mocked(ctx.provider.complete).mock.calls[0]![1]).toBe(CV_IMPORT.MAX_OUTPUT_TOKENS);
    expect(CV_IMPORT.MAX_OUTPUT_TOKENS).toBeGreaterThan(LLM.DEFAULT_MAX_TOKENS);
  });

  it('asks the model for JSON and fences the CV as untrusted data', async () => {
    await run(ctx.useCase);
    const [messages, , , options] = vi.mocked(ctx.provider.complete).mock.calls[0]!;
    expect(options).toEqual({ json: true });
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Jane Doe — CV text');
    expect(user).toMatch(/untrusted/i);
  });

  describe('file checks', () => {
    it('refuses an unsupported type before spending the rate limit or the model', async () => {
      await expect(
        ctx.useCase.execute({ userId: 'user-1', buffer: pdfBuffer, mimeType: MIME_TYPE.DOC }),
      ).rejects.toThrow(/\.doc/);
      expect(ctx.deps.parseCvRateLimiter.consume).not.toHaveBeenCalled();
      expect(ctx.deps.llmProviderFactory.forUser).not.toHaveBeenCalled();
    });

    it('refuses a file whose bytes do not match its type', async () => {
      await expect(
        ctx.useCase.execute({
          userId: 'user-1',
          buffer: Buffer.from('MZ-not-a-pdf'),
          mimeType: MIME_TYPE.PDF,
        }),
      ).rejects.toThrow(ValidationError);
      expect(ctx.deps.documentTextExtractor.extract).not.toHaveBeenCalled();
    });

    it('refuses an empty buffer', async () => {
      await expect(
        ctx.useCase.execute({ userId: 'user-1', buffer: Buffer.alloc(0), mimeType: MIME_TYPE.PDF }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('limits and configuration', () => {
    it('is rate limited per user', async () => {
      ctx.deps.parseCvRateLimiter.consume = vi.fn().mockResolvedValue(false);
      await expect(run(ctx.useCase)).rejects.toThrow(RateLimitedError);
      expect(ctx.deps.parseCvRateLimiter.consume).toHaveBeenCalledWith('cv-import:user:user-1');
      expect(ctx.deps.documentTextExtractor.extract).not.toHaveBeenCalled();
    });

    it('asks for an AI key, before reading the file, when the user has none', async () => {
      ctx.deps.llmProviderFactory.forUser = vi.fn().mockResolvedValue(null);
      await expect(run(ctx.useCase)).rejects.toThrow(AiNotConfiguredError);
      expect(ctx.deps.documentTextExtractor.extract).not.toHaveBeenCalled();
    });
  });

  describe('reading the file', () => {
    it.each(['', '   \n\t ', '\n\n'])('reports a file with no text (%j)', async (text) => {
      ctx = build(aiReply, text);
      await expect(run(ctx.useCase)).rejects.toThrow(/couldn't read any text/);
      expect(ctx.provider.complete).not.toHaveBeenCalled();
    });

    it('turns an extractor crash on a corrupt file into a validation error', async () => {
      ctx.deps.documentTextExtractor.extract = vi.fn().mockRejectedValue(new Error('bad xref'));
      const err = await run(ctx.useCase).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).not.toContain('bad xref');
    });

    it('cuts a long CV to the model budget and says so', async () => {
      ctx = build(aiReply, 'x'.repeat(AI_PROMPT_INPUT.CV_IMPORT_MAX_CHARS + 500));
      const result = await run(ctx.useCase);
      expect(result.truncated).toBe(true);
      const user = vi
        .mocked(ctx.provider.complete)
        .mock.calls[0]![0].find((m) => m.role === 'user')!.content;
      expect(user).not.toContain('x'.repeat(AI_PROMPT_INPUT.CV_IMPORT_MAX_CHARS + 1));
    });

    it('does not flag a CV that fits exactly', async () => {
      ctx = build(aiReply, 'x'.repeat(AI_PROMPT_INPUT.CV_IMPORT_MAX_CHARS));
      expect((await run(ctx.useCase)).truncated).toBe(false);
    });
  });

  describe('the model reply', () => {
    it('fails with an AI error when the reply is not JSON', async () => {
      ctx = build('Sure! Here is the profile');
      await expect(run(ctx.useCase)).rejects.toThrow(AiResponseInvalidError);
    });

    it('fails with an AI error when the reply was cut off', async () => {
      ctx.provider.complete = vi
        .fn()
        .mockResolvedValue({ content: '{"work', usage: null, truncated: true });
      await expect(run(ctx.useCase)).rejects.toThrow(AiResponseInvalidError);
    });

    it('treats missing sections as empty', async () => {
      ctx = build({ skills: [{ name: 'Go' }] });
      const result = await run(ctx.useCase);
      expect(result.workExperiences).toEqual([]);
      expect(result.educations).toEqual([]);
      expect(result.skills).toHaveLength(1);
    });

    it('accepts fenced JSON like the other parsers', async () => {
      ctx = build('```json\n' + JSON.stringify(aiReply) + '\n```');
      expect((await run(ctx.useCase)).skills).toHaveLength(1);
    });

    it('fails when a section has the wrong shape', async () => {
      ctx = build({ skills: 'TypeScript, Go' });
      await expect(run(ctx.useCase)).rejects.toThrow(AiResponseInvalidError);
    });
  });

  describe('normalising dates', () => {
    const dated = (startDate: unknown, endDate: unknown) =>
      build({
        workExperiences: [{ company: 'A', title: 'B', startDate, endDate }],
      });

    it.each([
      ['2020-03', '2020-03'],
      ['2020', '2020-01'],
      ['2020-03-15', '2020-03'],
      ['2020-3', '2020-03'],
      [2020, '2020-01'],
      ['  2019-11 ', '2019-11'],
    ])('reads start date %j as %s', async (input, expected) => {
      const result = await run(dated(input, null).useCase);
      expect(result.workExperiences[0]!.startDate).toBe(expected);
    });

    it.each(['Present', 'present', 'Current', 'now', 'Ongoing', 'to date'])(
      'reads end date %j as still held',
      async (word) => {
        const result = await run(dated('2020-01', word).useCase);
        expect(result.workExperiences[0]!.endDate).toBeNull();
      },
    );

    it.each(['Spring 2020', 'March', '20-20', '2020-13', '2020-00', '99999', ''])(
      'drops an entry whose start date is %j',
      async (bad) => {
        const result = await run(dated(bad, null).useCase);
        expect(result.workExperiences).toEqual([]);
      },
    );

    it('keeps the entry but clears an end date it cannot read', async () => {
      const result = await run(dated('2020-01', 'sometime').useCase);
      expect(result.workExperiences[0]!.endDate).toBeNull();
    });

    it('clears an end date that is before the start', async () => {
      const result = await run(dated('2020-06', '2019-01').useCase);
      expect(result.workExperiences[0]).toMatchObject({ startDate: '2020-06', endDate: null });
    });
  });

  describe('dropping and trimming entries', () => {
    it('drops entries missing a required field and keeps the rest', async () => {
      ctx = build({
        workExperiences: [
          { company: 'Good', title: 'Dev', startDate: '2020-01' },
          { company: '', title: 'Dev', startDate: '2020-01' },
          { company: 'NoTitle', startDate: '2020-01' },
          { company: 'NoStart', title: 'Dev' },
        ],
        educations: [
          { institution: 'Uni', startDate: '2010' },
          { institution: '  ', startDate: '2010' },
          { degree: 'MSc', startDate: '2010' },
        ],
        skills: [{ name: 'Go' }, { name: '' }, { category: 'Language' }],
      });
      const result = await run(ctx.useCase);
      expect(result.workExperiences.map((w) => w.company)).toEqual(['Good']);
      expect(result.educations.map((e) => e.institution)).toEqual(['Uni']);
      expect(result.skills.map((s) => s.name)).toEqual(['Go']);
    });

    it('trims text and turns blank optional fields into null', async () => {
      ctx = build({
        workExperiences: [
          {
            company: '  Acme  ',
            title: ' Dev ',
            location: '   ',
            startDate: '2020-01',
            description: '',
          },
        ],
      });
      expect((await run(ctx.useCase)).workExperiences[0]).toMatchObject({
        company: 'Acme',
        title: 'Dev',
        location: null,
        description: null,
      });
    });

    it('clips over-long fields to their limits', async () => {
      ctx = build({
        workExperiences: [
          {
            company: 'c'.repeat(CV_IMPORT.SHORT_FIELD_MAX_CHARS + 50),
            title: 'Dev',
            startDate: '2020-01',
            description: 'd'.repeat(CV_IMPORT.DESCRIPTION_MAX_CHARS + 50),
          },
        ],
      });
      const entry = (await run(ctx.useCase)).workExperiences[0]!;
      expect(entry.company).toHaveLength(CV_IMPORT.SHORT_FIELD_MAX_CHARS);
      expect(entry.description).toHaveLength(CV_IMPORT.DESCRIPTION_MAX_CHARS);
    });

    it('caps each section at its entry limit', async () => {
      ctx = build({
        workExperiences: Array.from({ length: CV_IMPORT.MAX_WORK_EXPERIENCES + 5 }, (_, i) => ({
          company: `Co ${i}`,
          title: 'Dev',
          startDate: '2020-01',
        })),
        educations: Array.from({ length: CV_IMPORT.MAX_EDUCATIONS + 5 }, (_, i) => ({
          institution: `Uni ${i}`,
          startDate: '2010',
        })),
        skills: Array.from({ length: CV_IMPORT.MAX_SKILLS + 5 }, (_, i) => ({
          name: `Skill ${i}`,
        })),
      });
      const result = await run(ctx.useCase);
      expect(result.workExperiences).toHaveLength(CV_IMPORT.MAX_WORK_EXPERIENCES);
      expect(result.educations).toHaveLength(CV_IMPORT.MAX_EDUCATIONS);
      expect(result.skills).toHaveLength(CV_IMPORT.MAX_SKILLS);
    });

    it.each([
      ['Expert', 'expert'],
      [' advanced ', 'advanced'],
      ['BEGINNER', 'beginner'],
      ['Native speaker', null],
      ['5 years', null],
      ['', null],
    ])(
      'reads skill proficiency %j as %j (the picker only knows four levels)',
      async (given, expected) => {
        ctx = build({ skills: [{ name: 'Go', proficiency: given }] });
        expect((await run(ctx.useCase)).skills[0]!.proficiency).toBe(expected);
      },
    );

    it('lists a skill once even when the CV repeats it in another case', async () => {
      ctx = build({ skills: [{ name: 'TypeScript' }, { name: 'typescript' }, { name: ' Go ' }] });
      expect((await run(ctx.useCase)).skills.map((s) => s.name)).toEqual(['TypeScript', 'Go']);
    });
  });

  describe('marking what is already in the profile', () => {
    it('flags a work experience with the same company, title and start month', async () => {
      ctx.deps.workExperienceRepository.findAllByUserId = vi.fn().mockResolvedValue([
        makeWorkExperience({
          company: 'ACME corp',
          title: 'senior engineer',
          startDate: new Date('2020-03-20T00:00:00Z'),
        }),
      ]);
      expect((await run(ctx.useCase)).workExperiences[0]!.alreadyInProfile).toBe(true);
    });

    it('does not flag the same role starting in another month', async () => {
      ctx.deps.workExperienceRepository.findAllByUserId = vi.fn().mockResolvedValue([
        makeWorkExperience({
          company: 'Acme Corp',
          title: 'Senior Engineer',
          startDate: new Date('2020-04-01T00:00:00Z'),
        }),
      ]);
      expect((await run(ctx.useCase)).workExperiences[0]!.alreadyInProfile).toBe(false);
    });

    it('flags an education with the same institution and degree', async () => {
      ctx.deps.educationRepository.findAllByUserId = vi
        .fn()
        .mockResolvedValue([makeEducation({ institution: 'uc berkeley', degree: 'b.s.' })]);
      expect((await run(ctx.useCase)).educations[0]!.alreadyInProfile).toBe(true);
    });

    it('does not flag a different degree at the same institution', async () => {
      ctx.deps.educationRepository.findAllByUserId = vi
        .fn()
        .mockResolvedValue([makeEducation({ institution: 'UC Berkeley', degree: 'M.S.' })]);
      expect((await run(ctx.useCase)).educations[0]!.alreadyInProfile).toBe(false);
    });

    it('flags a skill with the same name in any case', async () => {
      ctx.deps.skillRepository.findAllByUserId = vi
        .fn()
        .mockResolvedValue([makeSkill({ name: 'typescript' })]);
      expect((await run(ctx.useCase)).skills[0]!.alreadyInProfile).toBe(true);
    });

    it("reads only the requesting user's records", async () => {
      await run(ctx.useCase);
      expect(ctx.deps.workExperienceRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
      expect(ctx.deps.educationRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
      expect(ctx.deps.skillRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
    });

    it('writes nothing', async () => {
      await run(ctx.useCase);
      expect(ctx.deps.workExperienceRepository.create).not.toHaveBeenCalled();
      expect(ctx.deps.educationRepository.create).not.toHaveBeenCalled();
      expect(ctx.deps.skillRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('the CV text stays out of failures', () => {
    it('does not put the CV text in a model error', async () => {
      const provider: ILLMProvider = makeLLMProvider('not json');
      ctx.deps.llmProviderFactory.forUser = vi.fn().mockResolvedValue(provider);
      const err = (await run(ctx.useCase).catch((e: unknown) => e)) as Error;
      expect(err.message).not.toContain('Jane Doe');
    });
  });
});
