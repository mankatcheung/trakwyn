import { z } from 'zod';
import {
  AiNotConfiguredError,
  AiResponseInvalidError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { INoteRepository } from '#src/use-cases/ports/INoteRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import { formatApplicationContext } from '#src/use-cases/shared/applicationContext.js';
import { formatCrossApplicationContext } from '#src/use-cases/shared/crossApplicationContext.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import {
  loadUserProfile,
  formatUserProfile,
  isUserProfileEmpty,
  type UserProfile,
  type UserProfileRepositories,
} from '#src/use-cases/shared/userProfile.js';
import { AI_PROMPT_INPUT } from '#src/use-cases/constants.js';

export interface GenerateResumeInput {
  applicationId: string;
  userId: string;
}

interface Deps extends UserProfileRepositories {
  llmProviderFactory: ILLMProviderFactory;
  applicationRepository: IApplicationRepository;
  userRepository: IUserRepository;
  generateResumeRateLimiter: IRateLimiter;
  noteRepository: INoteRepository;
  documentDraftRepository: IDocumentDraftRepository;
}

const resumeSchema = z.object({
  summary: z.string().optional(),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      period: z.string().optional(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      qualification: z.string().optional(),
      period: z.string().optional(),
    }),
  ),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
});

const SYSTEM_PROMPT = `You are a resume writer. You will be given a candidate's real work experience, education and skills, and a job they are applying for.

Your job is to SELECT, ORDER and REWORD what you are given so it reads well for this specific role. You are tailoring, not authoring.

Absolute rules:
- Never invent an employer, job title, institution, qualification, date, skill or achievement. Every company and institution you name must be one that appears in the candidate's background below.
- Never inflate seniority or exaggerate scope. If the background is thin, produce a short resume.
- Prefer the candidate's own wording where it is already clear.
- Write bullets as concrete accomplishments drawn from the descriptions provided. If a role has no description, write no bullets for it rather than imagining them.

Return ONLY minified JSON of this shape, with no markdown fence and no commentary:
{"summary":string,"experience":[{"company":string,"title":string,"period":string,"bullets":[string]}],"education":[{"institution":string,"qualification":string,"period":string}],"skills":[{"category":string,"items":[string]}]}`;

/** Compared loosely: rewording is allowed, inventing is not. */
const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Every employer and institution in the output must be one the user entered.
 *
 * A resume asserts facts about someone's history. A model that adds a job is
 * not producing a worse draft, it is producing a document that is harmful to
 * send — so this refuses rather than filtering the invented entries out, which
 * would hand back a plausible resume with no sign anything had gone wrong.
 */
function assertGrounded(resume: ResumeContent, profile: UserProfile): void {
  const companies = new Set(profile.workExperiences.map((w) => normalize(w.company)));
  const institutions = new Set(profile.educations.map((e) => normalize(e.institution)));

  const inventedEmployer = resume.experience.find((e) => !companies.has(normalize(e.company)));
  const inventedSchool = resume.education.find((e) => !institutions.has(normalize(e.institution)));

  if (inventedEmployer || inventedSchool) {
    throw new AiResponseInvalidError(
      'The AI produced a resume containing experience you have not recorded — nothing was saved. Please try again.',
    );
  }
}

export class GenerateResumeUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateResumeInput): Promise<ResumeContent> {
    if (!(await this.deps.generateResumeRateLimiter.consume(`resume:user:${input.userId}`))) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const profile = await loadUserProfile(this.deps, input.userId);
    if (isUserProfileEmpty(profile)) {
      // Nothing truthful to build from. Asking the model anyway is an
      // invitation to invent an entire history.
      throw new ValidationError(
        'Add your work experience, education or skills in Settings before generating a resume',
      );
    }

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId);
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const [user, notes] = await Promise.all([
      this.deps.userRepository.findById(input.userId),
      this.deps.noteRepository.findAllByApplicationId(input.applicationId),
    ]);
    // Notes only, no company briefing: a resume is about the candidate, and
    // the briefing is unverified model output about the employer. Nothing in
    // it belongs in a document asserting this person's history (JEF-205).
    const context = formatApplicationContext({ notes, briefing: null });

    // Only fetched when the user opted in (JEF-249). Voice/phrasing only —
    // `assertGrounded` below is what actually stops an employer or
    // institution named in this context from ending up asserted as fact.
    let crossApplicationContext = '';
    if (user?.useCrossApplicationContext) {
      const [otherNotes, otherCoverLetters] = await Promise.all([
        this.deps.noteRepository.findRecentByUserExcludingApplication(
          input.userId,
          input.applicationId,
          AI_PROMPT_INPUT.CROSS_APPLICATION_CONTEXT_MAX_APPLICATIONS,
        ),
        this.deps.documentDraftRepository.findRecentCoverLettersByUserExcludingApplication(
          input.userId,
          input.applicationId,
          AI_PROMPT_INPUT.CROSS_APPLICATION_CONTEXT_MAX_APPLICATIONS,
        ),
      ]);
      crossApplicationContext = formatCrossApplicationContext(otherNotes, otherCoverLetters);
    }

    const messages: LLMMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (user?.customAiPrompt) messages.push({ role: 'system', content: user.customAiPrompt });
    messages.push({
      role: 'user',
      content: this.buildPrompt(app, profile, context, crossApplicationContext),
    });

    const result = await llmProvider.complete(messages, 2048, undefined, { json: true });
    assertNotTruncated(result);
    const resume = parseAiJson<ResumeContent>(result.content, resumeSchema);
    assertGrounded(resume, profile);
    return resume;
  }

  private buildPrompt(
    app: { company: string; role: string; location?: string | null; description?: string | null },
    profile: UserProfile,
    applicationContext: string,
    crossApplicationContext: string,
  ): string {
    return [
      'Tailor this candidate to the following role.',
      `Company: ${app.company}`,
      `Role: ${app.role}`,
      ...(app.location ? [`Location: ${app.location}`] : []),
      ...(app.description
        ? [
            `\nJob description:\n${wrapUntrustedContent(
              app.description.slice(0, AI_PROMPT_INPUT.COVER_LETTER_JOB_DESCRIPTION_MAX_CHARS),
            )}`,
          ]
        : []),
      ...(applicationContext ? [`\n${applicationContext}`] : []),
      ...(crossApplicationContext ? [`\n${crossApplicationContext}`] : []),
      `\nCandidate background — the only facts you may use:\n${formatUserProfile(profile)}`,
    ].join('\n');
  }
}
