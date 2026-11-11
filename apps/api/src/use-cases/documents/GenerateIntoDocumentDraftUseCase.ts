import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { proseToTiptapDoc } from '#src/use-cases/shared/proseToTiptapDoc.js';
import { buildResumeContact } from '#src/use-cases/shared/buildResumeContact.js';
import { resumeToTiptapDoc } from '#src/use-cases/shared/resumeToTiptapDoc.js';
import { resolveResumeText } from '#src/use-cases/documents/resolveResumeText.js';
import { toAiGeneration } from '#src/use-cases/aiFeedback/toAiGeneration.js';
import { coverLetterPrompt } from '#src/use-cases/prompts/coverLetter.js';
import { resumePrompt } from '#src/use-cases/prompts/resume.js';
import type { LLMAnsweredBy } from '#src/use-cases/ports/ILLMProvider.js';

export interface GenerateIntoDocumentDraftInput {
  userId: string;
  draftId: string;
  instructions?: string | null;
  /** Cover letters only: one of the application's resumes to base the letter on. */
  resumeDocumentId?: string | null;
  resumeDraftId?: string | null;
}

export interface GenerateIntoDocumentDraftOutput {
  contentJson: string;
  plainText: string;
}

export interface IGenerateIntoDocumentDraftUseCase {
  execute(input: GenerateIntoDocumentDraftInput): Promise<GenerateIntoDocumentDraftOutput>;
}

interface Deps {
  generateCoverLetterUseCase: {
    execute(input: {
      userId: string;
      applicationId: string;
      resumeText?: string | null;
      instructions?: string | null;
      onAnswered?: (answeredBy: LLMAnsweredBy | undefined) => void;
    }): Promise<string>;
  };
  generateResumeUseCase: {
    execute(input: {
      userId: string;
      applicationId: string;
      instructions?: string | null;
      onAnswered?: (answeredBy: LLMAnsweredBy | undefined) => void;
    }): Promise<ResumeContent>;
  };
  documentDraftRepository: IDocumentDraftRepository;
  documentRepository: IDocumentRepository;
  extractDocumentTextUseCase: IExtractDocumentTextUseCase;
  applicationRepository: IApplicationRepository;
  userRepository: IUserRepository;
}

/**
 * Generates content for an existing draft (JEF-506) and hands it back without
 * saving it, so the editor can show it for the user to accept. It wraps the
 * same generators the "generate a new draft" mutations use, so the rate limit,
 * prompt, grounding check and AI-not-configured handling are shared, and it
 * creates no draft, so the per-application draft cap is not in play.
 */
export class GenerateIntoDocumentDraftUseCase implements IGenerateIntoDocumentDraftUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateIntoDocumentDraftInput): Promise<GenerateIntoDocumentDraftOutput> {
    const draft = await this.deps.documentDraftRepository.findById(input.draftId);
    if (!draft) throw new NotFoundError('Document draft not found');

    const app = await this.deps.applicationRepository.findById(draft.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    let answeredBy: LLMAnsweredBy | undefined;
    const onAnswered = (a: LLMAnsweredBy | undefined) => {
      answeredBy = a;
    };
    // The draft is saved later by the editor, so what a rating needs to know
    // (who wrote this generation, JEF-547) is noted on the draft now.
    const recordGeneration = async (promptVersion: number) => {
      const generation = toAiGeneration(answeredBy, promptVersion);
      if (generation)
        await this.deps.documentDraftRepository.recordGeneration(draft.id, generation);
    };

    if (draft.type === 'resume') {
      const resume = await this.deps.generateResumeUseCase.execute({
        userId: input.userId,
        applicationId: draft.applicationId,
        instructions: input.instructions,
        onAnswered,
      });
      await recordGeneration(resumePrompt.version);
      return resumeToTiptapDoc(
        resume,
        buildResumeContact(await this.deps.userRepository.findById(input.userId)),
      );
    }

    const resumeText = await resolveResumeText(this.deps, {
      userId: input.userId,
      applicationId: draft.applicationId,
      resumeDocumentId: input.resumeDocumentId,
      resumeDraftId: input.resumeDraftId,
    });
    const letter = await this.deps.generateCoverLetterUseCase.execute({
      userId: input.userId,
      applicationId: draft.applicationId,
      resumeText,
      instructions: input.instructions,
      onAnswered,
    });
    await recordGeneration(coverLetterPrompt.version);
    return proseToTiptapDoc(letter);
  }
}
