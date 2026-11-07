import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { buildResumeContact } from '#src/use-cases/shared/buildResumeContact.js';
import { resumeToTiptapDoc } from '#src/use-cases/shared/resumeToTiptapDoc.js';
import { assertDraftCapacity } from '#src/use-cases/documents/assertDraftCapacity.js';

interface GenerateResume {
  execute(input: { userId: string; applicationId: string }): Promise<ResumeContent>;
}

export interface GenerateResumeDraftCommand {
  userId: string;
  applicationId: string;
}

export interface IGenerateResumeDraftUseCase {
  execute(command: GenerateResumeDraftCommand): Promise<DocumentDraft>;
}

interface Deps {
  generateResumeUseCase: GenerateResume;
  documentDraftRepository: IDocumentDraftRepository;
  applicationRepository: IApplicationRepository;
  userRepository: IUserRepository;
  generateId: () => string;
  now: () => Date;
}

/**
 * Generates a tailored resume and keeps it, as a `DocumentDraft`.
 *
 * Composes `GenerateResumeUseCase` rather than absorbing it, exactly as
 * `GenerateCoverLetterDraftUseCase` does: the model call keeps its own rate
 * limiter, prompt and grounding check, so there is no second path to the
 * provider that skips them.
 *
 * The draft is created only after generation succeeds *and* passes the
 * grounding check, so a refused resume leaves nothing behind.
 */
export class GenerateResumeDraftUseCase implements IGenerateResumeDraftUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(command: GenerateResumeDraftCommand): Promise<DocumentDraft> {
    const app = await this.deps.applicationRepository.findById(command.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== command.userId) throw new ForbiddenError('Forbidden');

    await assertDraftCapacity(this.deps.documentDraftRepository, command.applicationId);

    const resume = await this.deps.generateResumeUseCase.execute({
      userId: command.userId,
      applicationId: command.applicationId,
    });
    const { contentJson, plainText } = resumeToTiptapDoc(
      resume,
      buildResumeContact(await this.deps.userRepository.findById(command.userId)),
    );

    return this.deps.documentDraftRepository.create({
      id: this.deps.generateId(),
      applicationId: command.applicationId,
      type: 'resume',
      title: `${app.company} — ${app.role} (${this.deps.now().toISOString().slice(0, 10)})`,
      contentJson,
      plainText,
    });
  }
}
