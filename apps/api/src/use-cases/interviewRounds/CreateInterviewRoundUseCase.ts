import { actorPayload } from '#src/use-cases/shared/mcpActor.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IAiAnalytics } from '#src/use-cases/ports/IAiAnalytics.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { Application } from '#src/domain/application/Application.js';
import { pickGeneratedResumeDraft } from '#src/use-cases/documents/generatedResume.js';
import type { IActivityLogRepository } from '#src/use-cases/ports/IActivityLogRepository.js';
import { CONTENT_LIMITS, DEFAULTS } from '#src/use-cases/constants.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';
import type {
  ICreateInterviewRoundUseCase,
  CreateInterviewRoundInput,
  CreateInterviewRoundOutput,
} from '#src/use-cases/interviewRounds/ICreateInterviewRoundUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  activityLogRepository?: IActivityLogRepository;
  /** Both optional: without them the first-interview event (JEF-598) is simply not sent. */
  documentDraftRepository?: IDocumentDraftRepository;
  aiAnalytics?: IAiAnalytics;
  logger?: ILogger;
  generateId: () => string;
}

export class CreateInterviewRoundUseCase implements ICreateInterviewRoundUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateInterviewRoundInput): Promise<CreateInterviewRoundOutput> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const existingRounds = await this.deps.interviewRoundRepository.countByApplicationId(
      input.applicationId,
    );
    assertUnderLimit(
      existingRounds,
      CONTENT_LIMITS.INTERVIEW_ROUNDS_PER_APPLICATION,
      'interview rounds on this application',
    );

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

    if (existingRounds === 0) await this.reportFirstInterview(app);

    return round;
  }

  /**
   * The first interview round is the signal the resume worked (JEF-598), so it
   * is reported with which prompt version and model wrote the resume this
   * application went out with, when the AI wrote it. Best effort: a failed
   * lookup or send never fails the user's own action.
   */
  private async reportFirstInterview(app: Application): Promise<void> {
    const { documentDraftRepository, aiAnalytics } = this.deps;
    if (!documentDraftRepository || !aiAnalytics) return;
    try {
      const drafts = await documentDraftRepository.findAllByApplicationId(app.id);
      const generation = pickGeneratedResumeDraft(drafts, app.appliedAt)?.generation;
      if (!generation) return;
      aiAnalytics.interviewReached({
        userId: app.userId,
        provider: generation.provider,
        model: generation.model,
        promptVersion: generation.promptVersion,
        source: generation.source,
        tier: generation.tier,
      });
    } catch (err) {
      this.deps.logger?.warn('Could not report the first interview round', err, {
        event: 'interview.first_reached.report_failed',
      });
    }
  }
}
