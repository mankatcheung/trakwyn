import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { ISyncCalendarEventUseCase } from '#src/use-cases/calendar/ISyncCalendarEventUseCase.js';
import type {
  IDeleteInterviewRoundUseCase,
  DeleteInterviewRoundInput,
} from '#src/use-cases/interviewRounds/IDeleteInterviewRoundUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  syncCalendarEventUseCase?: ISyncCalendarEventUseCase;
}

export class DeleteInterviewRoundUseCase implements IDeleteInterviewRoundUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DeleteInterviewRoundInput): Promise<void> {
    const round = await this.deps.interviewRoundRepository.findById(input.roundId);
    if (!round) throw new NotFoundError('Interview round not found');

    const app = await this.deps.applicationRepository.findById(round.applicationId);
    if (!app || app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    await this.deps.interviewRoundRepository.delete(input.roundId, round.applicationId);

    await this.deps.syncCalendarEventUseCase?.execute({
      userId: input.userId,
      sourceType: 'interview',
      sourceId: input.roundId,
      event: null,
    });
  }
}
