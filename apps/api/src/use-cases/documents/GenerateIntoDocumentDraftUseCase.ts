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
    }): Promise<string>;
  };
  generateResumeUseCase: {
    execute(input: {
      userId: string;
      applicationId: string;
      instructions?: string | null;
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

    if (draft.type === 'resume') {
      const resume = await this.deps.generateResumeUseCase.execute({
        userId: input.userId,
        applicationId: draft.applicationId,
        instructions: input.instructions,
      });
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
    });
    return proseToTiptapDoc(letter);
  }
}
