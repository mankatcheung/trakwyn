import { actorPayload } from '#src/use-cases/shared/mcpActor.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IActivityLogRepository } from '#src/use-cases/ports/IActivityLogRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import type {
  IUpdateApplicationUseCase,
  UpdateApplicationInput,
  UpdateApplicationOutput,
} from '#src/use-cases/jobs/IUpdateApplicationUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  activityLogRepository?: IActivityLogRepository;
  generateId: () => string;
  transactionManager?: ITransactionManager;
}

export class UpdateApplicationUseCase implements IUpdateApplicationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdateApplicationInput): Promise<UpdateApplicationOutput> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) {
      throw new NotFoundError('Application not found');
    }
    if (app.userId !== input.userId) {
      throw new ForbiddenError('Forbidden');
    }

    const appliedAt = input.status === 'applied' && app.appliedAt === null ? new Date() : undefined;

    // A card that changes column keeps whatever rank it held in the old one,
    // which would drop it at an arbitrary depth in the new column. Resetting
    // to 0 puts it on top, matching where a newly created application lands.
    // A board drag sets the real index straight after this, so the 0 only
    // survives for status changes made somewhere else — the detail page, a
    // bulk action, the MCP tools.
    const changesColumn = input.status !== undefined && input.status !== app.status;

    const tags =
      input.tags === undefined
        ? undefined
        : input.tags.map((name) => ({ id: this.deps.generateId(), name }));

    const doUpdate = async () => {
      const updated = await this.deps.applicationRepository.update(input.applicationId, {
        company: input.company,
        role: input.role,
        status: input.status,
        jobUrl: input.jobUrl,
        location: input.location,
        salaryRange: input.salaryRange,
        description: input.description,
        starred: input.starred,
        source: input.source,
        followUpAt: input.followUpAt,
        tags,
        ...(appliedAt !== undefined ? { appliedAt } : {}),
        ...(changesColumn ? { boardPosition: 0 } : {}),
      });

      if (this.deps.activityLogRepository && this.deps.generateId) {
        const genId = this.deps.generateId;
        if (input.status !== undefined && input.status !== app.status) {
          await this.deps.activityLogRepository.append({
            id: genId(),
            applicationId: input.applicationId,
            actorId: input.userId,
            eventType: 'status_changed',
            payload: JSON.stringify({
              from: app.status,
              to: input.status,
              ...actorPayload(input.actor),
            }),
          });
        } else {
          const primitiveFields = [
            'company',
            'role',
            'jobUrl',
            'location',
            'salaryRange',
            'description',
            'source',
            'starred',
          ] as const;

          const changed: string[] = primitiveFields.filter(
            (f) => input[f] !== undefined && input[f] !== app[f],
          );

          if (input.followUpAt !== undefined) {
            const nextTime = input.followUpAt ? input.followUpAt.getTime() : null;
            const prevTime = app.followUpAt ? app.followUpAt.getTime() : null;
            if (nextTime !== prevTime) {
              changed.push('followUpAt');
            }
          }

          if (changed.length > 0) {
            await this.deps.activityLogRepository.append({
              id: genId(),
              applicationId: input.applicationId,
              actorId: input.userId,
              eventType: 'field_updated',
              payload: JSON.stringify({ fields: changed, ...actorPayload(input.actor) }),
            });
          }
        }
      }

      return updated;
    };

    return this.deps.transactionManager ? this.deps.transactionManager.run(doUpdate) : doUpdate();
  }
}
