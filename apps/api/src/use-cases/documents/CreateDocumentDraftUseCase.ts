import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';
import type {
  IDocumentDraftRepository,
  CreateDocumentDraftData,
} from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { assertDraftCapacity } from '#src/use-cases/documents/assertDraftCapacity.js';

export interface CreateDocumentDraftCommand {
  userId: string;
  applicationId: string;
  type: 'cover_letter' | 'resume';
  title: string;
  contentJson?: string;
  plainText?: string;
  sourceDocumentId?: string | null;
}

export interface ICreateDocumentDraftUseCase {
  execute(command: CreateDocumentDraftCommand): Promise<DocumentDraft>;
}

interface Deps {
  documentDraftRepository: IDocumentDraftRepository;
  applicationRepository: IApplicationRepository;
  generateId: () => string;
}

export class CreateDocumentDraftUseCase implements ICreateDocumentDraftUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(command: CreateDocumentDraftCommand): Promise<DocumentDraft> {
    const app = await this.deps.applicationRepository.findById(command.applicationId);
    if (!app || app.userId !== command.userId) {
      throw new NotFoundError('Application not found');
    }

    await assertDraftCapacity(this.deps.documentDraftRepository, command.applicationId);

    const id = this.deps.generateId();
    const data: CreateDocumentDraftData = {
      id,
      applicationId: command.applicationId,
      type: command.type,
      title: command.title,
      contentJson: command.contentJson,
      plainText: command.plainText,
      sourceDocumentId: command.sourceDocumentId,
    };

    return this.deps.documentDraftRepository.create(data);
  }
}
