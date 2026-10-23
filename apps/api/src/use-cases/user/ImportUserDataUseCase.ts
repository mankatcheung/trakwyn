import { QuotaExceededError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { INoteRepository } from '#src/use-cases/ports/INoteRepository.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '#src/domain/application/ApplicationStatus.js';
import { DEFAULTS } from '#src/use-cases/constants.js';
import type {
  IImportUserDataUseCase,
  ImportSummary,
} from '#src/use-cases/user/IImportUserDataUseCase.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  noteRepository: INoteRepository;
  entitlementService: IEntitlementService;
  generateId: () => string;
  transactionManager?: ITransactionManager;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asStatus(value: unknown): ApplicationStatus {
  return typeof value === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(value)
    ? (value as ApplicationStatus)
    : DEFAULTS.APPLICATION_STATUS;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export class ImportUserDataUseCase implements IImportUserDataUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string, rawData: string): Promise<ImportSummary> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      throw new ValidationError('Import file is not valid JSON');
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.applications)) {
      throw new ValidationError(
        'Import file must contain an "applications" array — export your data first',
      );
    }

    const { limits } = await this.deps.entitlementService.forUserId(userId);

    const summary: ImportSummary = {
      applicationsImported: 0,
      applicationsSkipped: 0,
      notesImported: 0,
      documentsSkipped: 0,
    };

    for (const entry of parsed.applications) {
      if (!isRecord(entry) || typeof entry.company !== 'string' || typeof entry.role !== 'string') {
        summary.applicationsSkipped++;
        continue;
      }
      if (entry.company.trim().length === 0 || entry.role.trim().length === 0) {
        summary.applicationsSkipped++;
        continue;
      }

      // One transaction per application: its row, appliedAt and notes land
      // together or not at all, while a bad entry still leaves the rest of the
      // import intact (a single transaction over the whole file would not).
      let notesImported: number;
      try {
        notesImported = await runInTransaction(this.deps.transactionManager, async () => {
          const app = await this.deps.applicationRepository.create({
            id: this.deps.generateId(),
            userId,
            company: entry.company as string,
            role: entry.role as string,
            status: asStatus(entry.status),
            jobUrl: asNullableString(entry.jobUrl),
            location: asNullableString(entry.location),
            salaryRange: asNullableString(entry.salaryRange),
            description: asNullableString(entry.description),
            applicationLimit: limits.applications,
          });

          const appliedAt = asDate(entry.appliedAt);
          if (appliedAt) {
            await this.deps.applicationRepository.update(app.id, { appliedAt });
          }

          let notes = 0;
          if (Array.isArray(entry.notes)) {
            for (const note of entry.notes) {
              if (
                isRecord(note) &&
                typeof note.content === 'string' &&
                note.content.trim().length > 0
              ) {
                await this.deps.noteRepository.create({
                  id: this.deps.generateId(),
                  applicationId: app.id,
                  content: note.content,
                });
                notes++;
              }
            }
          }
          return notes;
        });
      } catch (error) {
        if (error instanceof QuotaExceededError) {
          summary.applicationsSkipped++;
          continue;
        }
        throw error;
      }

      summary.applicationsImported++;
      summary.notesImported += notesImported;

      if (Array.isArray(entry.documents)) {
        // Exported document metadata has no storageKey — there's no file content to
        // restore, so we can only report how many were left out rather than recreate
        // broken records that point at nothing.
        summary.documentsSkipped += entry.documents.length;
      }
    }

    return summary;
  }
}
