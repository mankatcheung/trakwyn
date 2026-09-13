import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { ISyncCalendarEventUseCase } from '#src/use-cases/calendar/ISyncCalendarEventUseCase.js';
import { CALENDAR_SYNC } from '#src/use-cases/constants.js';
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

    await this.deps.syncCalendarEventUseCase?.execute({
      userId: input.userId,
      sourceType: 'interview',
      sourceId: updated.id,
      event: updated.scheduledAt
        ? {
            title: `Interview: ${app.company} — ${app.role}`,
            description: updated.notes,
            startAt: updated.scheduledAt,
            endAt: new Date(updated.scheduledAt.getTime() + CALENDAR_SYNC.INTERVIEW_DURATION_MS),
          }
        : null,
    });

    return updated;
  }
}
