import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { resolveResumeText } from '#src/use-cases/documents/resolveResumeText.js';
import { proseToTiptapDoc } from '#src/use-cases/shared/proseToTiptapDoc.js';
import { assertDraftCapacity } from '#src/use-cases/documents/assertDraftCapacity.js';

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

    await assertDraftCapacity(this.deps.documentDraftRepository, command.applicationId);

    const resumeText = await resolveResumeText(this.deps, command);

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
}
