import { ComputeResumeMatchScoreUseCase } from '#src/use-cases/application/ComputeResumeMatchScoreUseCase.js';
import { GenerateCoverLetterUseCase } from '#src/use-cases/coverLetter/GenerateCoverLetterUseCase.js';
import { GenerateResumeUseCase } from '#src/use-cases/resume/GenerateResumeUseCase.js';
import { ParseJobDescriptionUseCase } from '#src/use-cases/jobDescription/ParseJobDescriptionUseCase.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import type { GenerationFixture } from '#src/evals/fixtures/generationFixture.js';
import type { ResumeMatchView } from '#src/use-cases/application/ComputeResumeMatchScoreUseCase.js';
import type { ParsedJobDescription } from '#src/use-cases/jobDescription/ParseJobDescriptionUseCase.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';

/*
 * Runs the two real use cases, prompt and parsing included, with everything
 * around them stubbed to the minimum their happy path touches. The only thing
 * that is not production code is the storage and the user the use case would
 * otherwise look up.
 */

const EVAL_USER_ID = 'eval-user';
const EVAL_APPLICATION_ID = 'eval-application';
const EVAL_DRAFT_ID = 'eval-resume';

const unlimited: IRateLimiter = {
  consume: async () => true,
  isLimited: async () => false,
};

function factoryFor(provider: ILLMProvider): ILLMProviderFactory {
  return {
    forUser: async () => provider,
    resolveForUser: async () => ({
      provider,
      providerId: 'eval',
      fellBackFrom: null,
      source: 'byok',
    }),
    fromCredentials: () => provider,
  };
}

export async function parseJobPosting(
  provider: ILLMProvider,
  posting: string,
): Promise<ParsedJobDescription> {
  const useCase = new ParseJobDescriptionUseCase({
    llmProviderFactory: factoryFor(provider),
    jobPostingSourceResolver: {
      resolve: async ({ text }) => text ?? '',
      resolveDetailed: async ({ text }) => ({
        text: text ?? '',
        fetchedFromUrl: false,
        structured: null,
      }),
    },
    parsedPostingCache: {
      getOrParse: async (_text, parse) => ({ value: await parse(), cached: false }),
    },
    parseJobDescriptionRateLimiter: unlimited,
  });

  return useCase.execute({ userId: EVAL_USER_ID, text: posting });
}

type MatchDeps = ConstructorParameters<typeof ComputeResumeMatchScoreUseCase>[0];

export async function scoreResumeMatch(
  provider: ILLMProvider,
  input: { jobDescription: string; resume: string },
): Promise<ResumeMatchView> {
  // A resume given as a draft is the path that needs no document storage, so
  // those dependencies are never reached. The cast is the price of not
  // building a full repository for each of them.
  const deps = {
    applicationRepository: {
      findById: async () => ({
        id: EVAL_APPLICATION_ID,
        userId: EVAL_USER_ID,
        description: input.jobDescription,
      }),
    },
    documentDraftRepository: {
      findById: async () => ({
        id: EVAL_DRAFT_ID,
        applicationId: EVAL_APPLICATION_ID,
        type: 'resume',
        plainText: input.resume,
      }),
    },
    // Never a saved match: an eval must reach the model every time (JEF-450).
    resumeMatchRepository: {
      findByApplicationId: async () => [],
      upsert: async <T>(match: T): Promise<T> => match,
    },
    documentRepository: {},
    storageProvider: {},
    documentTextExtractor: {},
    llmProviderFactory: factoryFor(provider),
    computeResumeMatchScoreRateLimiter: unlimited,
    generateId: () => 'eval-match',
    now: () => new Date(),
  } as unknown as MatchDeps;

  return new ComputeResumeMatchScoreUseCase(deps).execute({
    applicationId: EVAL_APPLICATION_ID,
    userId: EVAL_USER_ID,
    documentDraftId: EVAL_DRAFT_ID,
  });
}

type ResumeDeps = ConstructorParameters<typeof GenerateResumeUseCase>[0];
type CoverLetterDeps = ConstructorParameters<typeof GenerateCoverLetterUseCase>[0];

/**
 * The repositories both generators read, answering from a fixture. Nothing
 * here is written to, and the cross-application context is off, so the only
 * inputs are the candidate, the posting and the notes the fixture holds.
 */
function generationDeps(provider: ILLMProvider, fixture: GenerationFixture) {
  return {
    llmProviderFactory: factoryFor(provider),
    applicationRepository: {
      findById: async () => ({ id: EVAL_APPLICATION_ID, userId: EVAL_USER_ID, ...fixture.app }),
    },
    workExperienceRepository: { findAllByUserId: async () => fixture.workExperiences },
    educationRepository: { findAllByUserId: async () => fixture.educations },
    skillRepository: { findAllByUserId: async () => fixture.skills },
    userRepository: {
      findById: async () => ({
        id: EVAL_USER_ID,
        useCrossApplicationContext: false,
        customAiPrompt: null,
      }),
    },
    noteRepository: {
      findAllByApplicationId: async () =>
        fixture.notes.map((content, index) => ({
          id: `eval-note-${index}`,
          applicationId: EVAL_APPLICATION_ID,
          content,
        })),
    },
    documentDraftRepository: {},
    companyBriefingRepository: { findByApplicationId: async () => null },
    generateResumeRateLimiter: unlimited,
    generateCoverLetterRateLimiter: unlimited,
  };
}

export async function generateResume(
  provider: ILLMProvider,
  fixture: GenerationFixture,
): Promise<ResumeContent> {
  const deps = generationDeps(provider, fixture) as unknown as ResumeDeps;
  return new GenerateResumeUseCase(deps).execute({
    applicationId: EVAL_APPLICATION_ID,
    userId: EVAL_USER_ID,
  });
}

export async function generateCoverLetter(
  provider: ILLMProvider,
  fixture: GenerationFixture,
): Promise<string> {
  const deps = generationDeps(provider, fixture) as unknown as CoverLetterDeps;
  return new GenerateCoverLetterUseCase(deps).execute({
    applicationId: EVAL_APPLICATION_ID,
    userId: EVAL_USER_ID,
  });
}
