import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { ISyncCalendarEventUseCase } from '#src/use-cases/calendar/ISyncCalendarEventUseCase.js';
import { interviewCalendarEvent } from '#src/use-cases/calendar/interviewCalendarEvent.js';
import type {
  IUpdateInterviewRoundUseCase,
  UpdateInterviewRoundInput,
  UpdateInterviewRoundOutput,
} from '#src/use-cases/interviewRounds/IUpdateInterviewRoundUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  syncCalendarEventUseCase?: ISyncCalendarEventUseCase;
}

export class UpdateInterviewRoundUseCase implements IUpdateInterviewRoundUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdateInterviewRoundInput): Promise<UpdateInterviewRoundOutput> {
    const round = await this.deps.interviewRoundRepository.findById(input.roundId);
    if (!round) throw new NotFoundError('Interview round not found');

    const app = await this.deps.applicationRepository.findById(round.applicationId);
    if (!app || app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const updated = await this.deps.interviewRoundRepository.update(input.roundId, {
      type: input.type,
      scheduledAt: input.scheduledAt,
      completedAt: input.completedAt,
      interviewerName: input.interviewerName,
      notes: input.notes,
      outcome: input.outcome,
    });

    // `null` when the date was cleared, which removes the Google event.
    await this.deps.syncCalendarEventUseCase?.execute({
      userId: input.userId,
      sourceType: 'interview',
      sourceId: updated.id,
      event: interviewCalendarEvent(app, updated),
    });

    return updated;
  }
}
