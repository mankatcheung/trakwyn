import { actorPayload } from '#src/use-cases/shared/mcpActor.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { INoteRepository } from '#src/use-cases/ports/INoteRepository.js';
import type { IActivityLogRepository } from '#src/use-cases/ports/IActivityLogRepository.js';
import type {
  ICreateNoteUseCase,
  CreateNoteInput,
  CreateNoteOutput,
} from '#src/use-cases/notes/ICreateNoteUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  noteRepository: INoteRepository;
  activityLogRepository?: IActivityLogRepository;
  generateId: () => string;
}

export class CreateNoteUseCase implements ICreateNoteUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateNoteInput): Promise<CreateNoteOutput> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) {
      throw new NotFoundError('Application not found');
    }
    if (app.userId !== input.userId) {
      throw new ForbiddenError('Forbidden');
    }

    const note = await this.deps.noteRepository.create({
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      content: input.content,
    });

    await this.deps.activityLogRepository?.append({
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      actorId: input.userId,
      eventType: 'note_added',
      payload: JSON.stringify({ noteId: note.id, ...actorPayload(input.actor) }),
    });

    return note;
  }
}
