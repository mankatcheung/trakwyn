import { z } from 'zod';
import {
  AiNotConfiguredError,
  DomainError,
  RateLimitedError,
  ServiceUnavailableError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import {
  AI_PROMPT_INPUT,
  CV_IMPORT,
  CV_IMPORT_PROMPT_TASK,
  RESUME_TEXT_EXTRACTION,
} from '#src/use-cases/constants.js';
import type { IDocumentTextExtractor } from '#src/use-cases/ports/IDocumentTextExtractor.js';
import type { IEducationRepository } from '#src/use-cases/ports/IEducationRepository.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import type { IWorkExperienceRepository } from '#src/use-cases/ports/IWorkExperienceRepository.js';
import { assertCvFile } from '#src/use-cases/profile/cvImportValidation.js';
import {
  cleanText,
  matchKey,
  monthOf,
  normalizeCvDate,
  normalizeCvEndDate,
  normalizeProficiency,
  uniqueBy,
} from '#src/use-cases/profile/cvProfileNormalization.js';
import type {
  IParseCvUseCase,
  ParseCvInput,
  ParsedCvEducation,
  ParsedCvProfile,
  ParsedCvSkill,
  ParsedCvWorkExperience,
} from '#src/use-cases/profile/IParseCvUseCase.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import { withTimeout } from '#src/use-cases/shared/withTimeout.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

interface Deps {
  llmProviderFactory: ILLMProviderFactory;
  documentTextExtractor: IDocumentTextExtractor;
  workExperienceRepository: IWorkExperienceRepository;
  educationRepository: IEducationRepository;
  skillRepository: ISkillRepository;
  parseCvRateLimiter: IRateLimiter;
}

const SYSTEM_PROMPT = `You are a CV parser. Your task is to ${CV_IMPORT_PROMPT_TASK} and return ONLY valid JSON with no markdown, no explanation, and no code fences. Copy what the CV says; never invent employers, schools, dates or skills. If a field cannot be determined, use null.`;

const USER_PROMPT_TEMPLATE = (
  text: string,
) => `Extract the following from this CV and return ONLY valid JSON:
{
  "workExperiences": [
    {
      "company": "employer name",
      "title": "job title",
      "location": "city, country or remote, or null",
      "startDate": "YYYY-MM, or YYYY when only the year is given",
      "endDate": "YYYY-MM, YYYY, or \\"Present\\" when the role is still held",
      "description": "one sentence of at most 200 characters on the responsibilities and achievements, or null"
    }
  ],
  "educations": [
    {
      "institution": "school or university",
      "degree": "degree or qualification, or null",
      "field": "field of study, or null",
      "startDate": "YYYY-MM, or YYYY when only the year is given",
      "endDate": "YYYY-MM, YYYY, \\"Present\\", or null",
      "description": "honours or thesis in at most 100 characters, or null"
    }
  ],
  "skills": [
    { "name": "skill name", "category": "e.g. Language, Framework, Tool, Soft skill, or null", "proficiency": "beginner, intermediate, advanced or expert, only if the CV states a level; otherwise null" }
  ]
}

List work experience and education from most recent to oldest. Leave out an entry whose start date the CV does not give.

CV:
${wrapUntrustedContent(text)}`;

const UNREADABLE_FILE_MESSAGE =
  "We couldn't read this file. It may be damaged or password protected.";
const NO_TEXT_MESSAGE = "We couldn't read any text from this file. It may be a scanned image.";

// A model may send null, omit a key, or give a year as a number; the
// normalisers decide what is usable. A field of the wrong kind (an object, a
// section that is a string) fails the whole reply rather than slipping through.
const textField = z.string().nullable().optional();
const dateField = z.union([z.string(), z.number()]).nullable().optional();

const parsedCvSchema = z.object({
  workExperiences: z
    .array(
      z.object({
        company: textField,
        title: textField,
        location: textField,
        startDate: dateField,
        endDate: dateField,
        description: textField,
      }),
    )
    .nullable()
    .optional(),
  educations: z
    .array(
      z.object({
        institution: textField,
        degree: textField,
        field: textField,
        startDate: dateField,
        endDate: dateField,
        description: textField,
      }),
    )
    .nullable()
    .optional(),
  skills: z
    .array(z.object({ name: textField, category: textField, proficiency: textField }))
    .nullable()
    .optional(),
});

type ParsedCvReply = z.infer<typeof parsedCvSchema>;

/**
 * Reads an uploaded CV into profile entries for the user to review (JEF-461).
 *
 * Writes nothing and keeps nothing: the file arrives as a buffer, is turned
 * into text, goes to the user's own model and is dropped. There is
 * deliberately no storage dependency here. The CV text is never logged or
 * placed in an error message.
 */
export class ParseCvUseCase implements IParseCvUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ParseCvInput): Promise<ParsedCvProfile> {
    // Before the rate limit: a wrong file should not use up the user's budget.
    assertCvFile(input.buffer, input.mimeType);

    if (!(await this.deps.parseCvRateLimiter.consume(`cv-import:user:${input.userId}`))) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    // Before reading the file: no key means no point spending the parse.
    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId);
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const text = (await this.extractText(input.buffer, input.mimeType)).trim();
    if (!text) throw new ValidationError(NO_TEXT_MESSAGE);

    const truncated = text.length > AI_PROMPT_INPUT.CV_IMPORT_MAX_CHARS;
    const result = await llmProvider.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: USER_PROMPT_TEMPLATE(text.slice(0, AI_PROMPT_INPUT.CV_IMPORT_MAX_CHARS)),
        },
      ],
      CV_IMPORT.MAX_OUTPUT_TOKENS,
      undefined,
      { json: true },
    );
    assertNotTruncated(result);
    const reply = parseAiJson(result.content, parsedCvSchema);

    return { ...(await this.toProfile(input.userId, reply)), truncated };
  }

  private async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      return await withTimeout(
        this.deps.documentTextExtractor.extract(buffer, mimeType),
        RESUME_TEXT_EXTRACTION.EXTRACT_TIMEOUT_MS,
        () => new ServiceUnavailableError('Reading the uploaded CV took too long'),
      );
    } catch (error) {
      // A parser's own error can quote the file, so a corrupt upload gets a fixed message.
      if (error instanceof DomainError) throw error;
      throw new ValidationError(UNREADABLE_FILE_MESSAGE);
    }
  }

  private async toProfile(
    userId: string,
    reply: ParsedCvReply,
  ): Promise<Omit<ParsedCvProfile, 'truncated'>> {
    const [existingWork, existingEducation, existingSkills] = await Promise.all([
      this.deps.workExperienceRepository.findAllByUserId(userId),
      this.deps.educationRepository.findAllByUserId(userId),
      this.deps.skillRepository.findAllByUserId(userId),
    ]);

    const knownWork = new Set(
      existingWork.map((w) => matchKey(w.company, w.title, monthOf(w.startDate))),
    );
    const knownEducation = new Set(existingEducation.map((e) => matchKey(e.institution, e.degree)));
    const knownSkills = new Set(existingSkills.map((s) => matchKey(s.name)));

    const workExperiences = uniqueBy(
      (reply.workExperiences ?? []).flatMap((entry) => this.workExperience(entry)),
      (w) => matchKey(w.company, w.title, w.startDate),
    )
      .slice(0, CV_IMPORT.MAX_WORK_EXPERIENCES)
      .map((w) => ({
        ...w,
        alreadyInProfile: knownWork.has(matchKey(w.company, w.title, w.startDate)),
      }));

    const educations = uniqueBy(
      (reply.educations ?? []).flatMap((entry) => this.education(entry)),
      (e) => matchKey(e.institution, e.degree, e.startDate),
    )
      .slice(0, CV_IMPORT.MAX_EDUCATIONS)
      .map((e) => ({
        ...e,
        alreadyInProfile: knownEducation.has(matchKey(e.institution, e.degree)),
      }));

    const skills = uniqueBy(
      (reply.skills ?? []).flatMap((entry) => this.skill(entry)),
      (s) => matchKey(s.name),
    )
      .slice(0, CV_IMPORT.MAX_SKILLS)
      .map((s) => ({ ...s, alreadyInProfile: knownSkills.has(matchKey(s.name)) }));

    return { workExperiences, educations, skills };
  }

  private workExperience(
    entry: NonNullable<ParsedCvReply['workExperiences']>[number],
  ): Array<Omit<ParsedCvWorkExperience, 'alreadyInProfile'>> {
    const company = cleanText(entry.company, CV_IMPORT.SHORT_FIELD_MAX_CHARS);
    const title = cleanText(entry.title, CV_IMPORT.SHORT_FIELD_MAX_CHARS);
    const startDate = normalizeCvDate(entry.startDate);
    if (!company || !title || !startDate) return [];
    return [
      {
        company,
        title,
        location: cleanText(entry.location, CV_IMPORT.SHORT_FIELD_MAX_CHARS),
        startDate,
        endDate: normalizeCvEndDate(entry.endDate, startDate),
        description: cleanText(entry.description, CV_IMPORT.DESCRIPTION_MAX_CHARS),
      },
    ];
  }

  private education(
    entry: NonNullable<ParsedCvReply['educations']>[number],
  ): Array<Omit<ParsedCvEducation, 'alreadyInProfile'>> {
    const institution = cleanText(entry.institution, CV_IMPORT.SHORT_FIELD_MAX_CHARS);
    const startDate = normalizeCvDate(entry.startDate);
    if (!institution || !startDate) return [];
    return [
      {
        institution,
        degree: cleanText(entry.degree, CV_IMPORT.SHORT_FIELD_MAX_CHARS),
        field: cleanText(entry.field, CV_IMPORT.SHORT_FIELD_MAX_CHARS),
        startDate,
        endDate: normalizeCvEndDate(entry.endDate, startDate),
        description: cleanText(entry.description, CV_IMPORT.DESCRIPTION_MAX_CHARS),
      },
    ];
  }

  private skill(
    entry: NonNullable<ParsedCvReply['skills']>[number],
  ): Array<Omit<ParsedCvSkill, 'alreadyInProfile'>> {
    const name = cleanText(entry.name, CV_IMPORT.SHORT_FIELD_MAX_CHARS);
    if (!name) return [];
    return [
      {
        name,
        category: cleanText(entry.category, CV_IMPORT.SHORT_FIELD_MAX_CHARS),
        proficiency: normalizeProficiency(entry.proficiency),
      },
    ];
  }
}
