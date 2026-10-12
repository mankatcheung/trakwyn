import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import { proseToTiptapDoc } from '#src/use-cases/shared/proseToTiptapDoc.js';

interface GenerateCoverLetter {
  execute(input: {
    userId: string;
    applicationId: string;
    resumeText?: string | null;
  }): Promise<string>;
}

export interface GenerateCoverLetterDraftCommand {
  userId: string;
  applicationId: string;
  /**
   * One of this application's resumes to base the letter on: an uploaded file
   * or a resume draft, never both. Resolved here, server-side, so the client
   * cannot point generation at someone else's document (JEF-396).
   */
  resumeDocumentId?: string | null;
  resumeDraftId?: string | null;
  /** Free text, kept for older clients. A selected resume takes precedence. */
  resumeText?: string | null;
}

export interface IGenerateCoverLetterDraftUseCase {
  execute(command: GenerateCoverLetterDraftCommand): Promise<DocumentDraft>;
}

interface Deps {
  generateCoverLetterUseCase: GenerateCoverLetter;
  documentDraftRepository: IDocumentDraftRepository;
  documentRepository: IDocumentRepository;
  extractDocumentTextUseCase: IExtractDocumentTextUseCase;
  applicationRepository: IApplicationRepository;
  generateId: () => string;
  now: () => Date;
}

/**
 * Generates a cover letter and keeps it, as a `DocumentDraft`.
 *
 * Composes `GenerateCoverLetterUseCase` rather than absorbing it, so the model
 * call keeps its own rate limiter, prompt and AI-not-configured handling —
 * there is no second, ungoverned path to the provider.
 *
 * The draft is only created if generation succeeded, so a rate limit or a
 * missing API key leaves nothing behind for the user to clean up.
 */
export class GenerateCoverLetterDraftUseCase implements IGenerateCoverLetterDraftUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(command: GenerateCoverLetterDraftCommand): Promise<DocumentDraft> {
    // Checked here as well as inside the generation use case, so an
    // application belonging to someone else is refused before the model runs
    // and before anything is charged to the owner's API key.
    const app = await this.deps.applicationRepository.findById(command.applicationId);
    if (!app) {
      throw new NotFoundError('Application not found');
    }
    if (app.userId !== command.userId) {
      throw new ForbiddenError('Forbidden');
    }

    const resumeText = await this.resolveResumeText(command);

    const letter = await this.deps.generateCoverLetterUseCase.execute({
      userId: command.userId,
      applicationId: command.applicationId,
      resumeText,
    });

    const { contentJson, plainText } = proseToTiptapDoc(letter);

    return this.deps.documentDraftRepository.create({
      id: this.deps.generateId(),
      applicationId: command.applicationId,
      type: 'cover_letter',
      title: `${app.company} — ${app.role} (${this.deps.now().toISOString().slice(0, 10)})`,
      contentJson,
      plainText,
    });
  }

  /**
   * The text of the selected resume, or the legacy pasted text. A selected
   * resume must belong to this application — the same rule the picker offers —
   * and be a resume, so an id from elsewhere is "not found" rather than read.
   */
  private async resolveResumeText(
    command: GenerateCoverLetterDraftCommand,
  ): Promise<string | null | undefined> {
    const { resumeDocumentId, resumeDraftId } = command;
    if (resumeDocumentId && resumeDraftId) {
      throw new ValidationError('Choose one resume, not both');
    }

    if (resumeDraftId) {
      const draft = await this.deps.documentDraftRepository.findById(resumeDraftId);
      if (!draft || draft.applicationId !== command.applicationId) {
        throw new NotFoundError('Resume not found');
      }
      if (draft.type !== 'resume') {
        throw new ValidationError('That draft is not a resume');
      }
      return draft.plainText;
    }

    if (resumeDocumentId) {
      const document = await this.deps.documentRepository.findById(resumeDocumentId);
      if (!document || document.applicationId !== command.applicationId) {
        throw new NotFoundError('Resume not found');
      }
      if (document.documentType !== 'resume') {
        throw new ValidationError('That file is not a resume');
      }
      const { text } = await this.deps.extractDocumentTextUseCase.execute({
        userId: command.userId,
        documentId: resumeDocumentId,
      });
      return text;
    }

    return command.resumeText;
  }
}
