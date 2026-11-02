import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { assertMaxLength } from '#src/use-cases/shared/assertUnderLimit.js';
import { FIELD_LENGTH_LIMITS } from '#src/use-cases/constants.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { INoteRepository } from '#src/use-cases/ports/INoteRepository.js';
import type {
  IUpdateNoteUseCase,
  UpdateNoteInput,
  UpdateNoteOutput,
} from '#src/use-cases/notes/IUpdateNoteUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  noteRepository: INoteRepository;
}

export class UpdateNoteUseCase implements IUpdateNoteUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdateNoteInput): Promise<UpdateNoteOutput> {
    assertMaxLength(input.content, FIELD_LENGTH_LIMITS.NOTE_CONTENT, 'A note');
    const note = await this.deps.noteRepository.findById(input.noteId);
    if (!note) {
      throw new NotFoundError('Note not found');
    }

    const app = await this.deps.applicationRepository.findById(note.applicationId);
    if (!app || app.userId !== input.userId) {
      throw new ForbiddenError('Forbidden');
    }

    return this.deps.noteRepository.update(input.noteId, input.content);
  }
}
