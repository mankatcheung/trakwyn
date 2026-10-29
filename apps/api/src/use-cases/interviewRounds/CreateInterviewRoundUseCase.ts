import { actorPayload } from '#src/use-cases/shared/mcpActor.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IActivityLogRepository } from '#src/use-cases/ports/IActivityLogRepository.js';
import { DEFAULTS } from '#src/use-cases/constants.js';
import type {
  ICreateInterviewRoundUseCase,
  CreateInterviewRoundInput,
  CreateInterviewRoundOutput,
} from '#src/use-cases/interviewRounds/ICreateInterviewRoundUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  activityLogRepository?: IActivityLogRepository;
  generateId: () => string;
}

export class CreateInterviewRoundUseCase implements ICreateInterviewRoundUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateInterviewRoundInput): Promise<CreateInterviewRoundOutput> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const round = await this.deps.interviewRoundRepository.create({
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      type: input.type ?? DEFAULTS.INTERVIEW_TYPE,
      scheduledAt: input.scheduledAt ?? null,
      completedAt: input.completedAt ?? null,
      interviewerName: input.interviewerName ?? null,
      notes: input.notes ?? null,
      outcome: input.outcome ?? DEFAULTS.INTERVIEW_OUTCOME,
    });

    await this.deps.activityLogRepository?.append({
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      actorId: input.userId,
      eventType: 'interview_added',
      payload: JSON.stringify({
        roundId: round.id,
        type: round.type,
        ...actorPayload(input.actor),
      }),
    });

    return round;
  }
}
