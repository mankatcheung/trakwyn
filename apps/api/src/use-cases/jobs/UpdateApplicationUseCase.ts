import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IActivityLogRepository } from '#src/use-cases/ports/IActivityLogRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import type { ISyncCalendarEventUseCase } from '#src/use-cases/calendar/ISyncCalendarEventUseCase.js';
import { CALENDAR_SYNC } from '#src/use-cases/constants.js';
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
  syncCalendarEventUseCase?: ISyncCalendarEventUseCase;
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
            payload: JSON.stringify({ from: app.status, to: input.status }),
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
              payload: JSON.stringify({ fields: changed }),
            });
          }
        }
      }

      return updated;
    };

    const updated = this.deps.transactionManager
      ? await this.deps.transactionManager.run(doUpdate)
      : await doUpdate();

    // Calendar sync runs after the write commits, not inside the transaction
    // above — it is fail-open by design (SyncCalendarEventUseCase never
    // throws) and calls an external API, neither of which belongs inside a
    // DB transaction.
    if (appliedAt) {
      await this.deps.syncCalendarEventUseCase?.execute({
        userId: input.userId,
        sourceType: 'applied',
        sourceId: updated.id,
        event: {
          title: `Applied: ${updated.company} — ${updated.role}`,
          description: null,
          startAt: appliedAt,
          endAt: new Date(appliedAt.getTime() + CALENDAR_SYNC.REMINDER_DURATION_MS),
        },
      });
    }

    if (input.followUpAt !== undefined) {
      await this.deps.syncCalendarEventUseCase?.execute({
        userId: input.userId,
        sourceType: 'followUp',
        sourceId: updated.id,
        event: updated.followUpAt
          ? {
              title: `Follow up: ${updated.company} — ${updated.role}`,
              description: null,
              startAt: updated.followUpAt,
              endAt: new Date(updated.followUpAt.getTime() + CALENDAR_SYNC.REMINDER_DURATION_MS),
            }
          : null,
      });
    }

    return updated;
  }
}
