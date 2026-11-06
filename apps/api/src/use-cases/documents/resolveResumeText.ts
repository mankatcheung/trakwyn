import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';

export interface ResumeTextDeps {
  documentDraftRepository: IDocumentDraftRepository;
  documentRepository: IDocumentRepository;
  extractDocumentTextUseCase: IExtractDocumentTextUseCase;
}

export interface ResumeTextSelection {
  userId: string;
  applicationId: string;
  resumeDocumentId?: string | null;
  resumeDraftId?: string | null;
  /** Free text, kept for older clients. A selected resume takes precedence. */
  resumeText?: string | null;
}

/**
 * The text of the selected resume, or the legacy pasted text. A selected
 * resume must belong to this application — the same rule the picker offers —
 * and be a resume, so an id from elsewhere is "not found" rather than read
 * (JEF-396). Shared by every path that bases a cover letter on a resume.
 */
export async function resolveResumeText(
  deps: ResumeTextDeps,
  selection: ResumeTextSelection,
): Promise<string | null | undefined> {
  const { resumeDocumentId, resumeDraftId } = selection;
  if (resumeDocumentId && resumeDraftId) {
    throw new ValidationError('Choose one resume, not both');
  }

  if (resumeDraftId) {
    const draft = await deps.documentDraftRepository.findById(resumeDraftId);
    if (!draft || draft.applicationId !== selection.applicationId) {
      throw new NotFoundError('Resume not found');
    }
    if (draft.type !== 'resume') {
      throw new ValidationError('That draft is not a resume');
    }
    return draft.plainText;
  }

  if (resumeDocumentId) {
    const document = await deps.documentRepository.findById(resumeDocumentId);
    if (!document || document.applicationId !== selection.applicationId) {
      throw new NotFoundError('Resume not found');
    }
    if (document.documentType !== 'resume') {
      throw new ValidationError('That file is not a resume');
    }
    const { text } = await deps.extractDocumentTextUseCase.execute({
      userId: selection.userId,
      documentId: resumeDocumentId,
    });
    return text;
  }

  return selection.resumeText;
}
