import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import { DOCUMENT_TYPE } from '#src/use-cases/constants.js';

export interface DocumentVersionOutcome {
  documentType: string;
  version: string | null;
  applicationCount: number;
  interviewCount: number;
  /** interviewCount / applicationCount as a whole-number percentage (0 when applicationCount is 0). */
  interviewRate: number;
}

interface Deps {
  entitlementService: IEntitlementService;
  documentRepository: IDocumentRepository;
  interviewRoundRepository: IInterviewRoundRepository;
}

export interface GetDocumentVersionOutcomesInput {
  userId: string;
}

interface Group {
  documentType: string;
  version: string | null;
  applicationIds: Set<string>;
}

/**
 * Turns per-application resume/cover-letter uploads into a longitudinal
 * view: for each (documentType, version) pair, how many applications it was
 * attached to and how many of those led to an interview (JEF-58).
 *
 * "Led to an interview" is defined as the application having at least one
 * InterviewRound record — a directly-recorded event — rather than inferring
 * it from Application.status, which is a single mutable field a user could
 * leave stale or skip past.
 *
 * `version` is free-text and optional at upload time (no normalization or
 * required-field enforcement exists yet), so documents with no version set
 * are grouped together under `version: null` rather than dropped.
 */
export class GetDocumentVersionOutcomesUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetDocumentVersionOutcomesInput): Promise<DocumentVersionOutcome[]> {
    await this.deps.entitlementService.assertFeature(input.userId, 'analytics');
    const [documents, interviewRounds] = await Promise.all([
      this.deps.documentRepository.findAllByUserId(input.userId),
      this.deps.interviewRoundRepository.findAllByUserId(input.userId),
    ]);

    const applicationIdsWithInterview = new Set(interviewRounds.map((r) => r.applicationId));

    const groups = new Map<string, Group>();
    for (const doc of documents) {
      if (
        doc.documentType !== DOCUMENT_TYPE.RESUME &&
        doc.documentType !== DOCUMENT_TYPE.COVER_LETTER
      ) {
        continue;
      }
      const key = `${doc.documentType}::${doc.version ?? ''}`;
      const group = groups.get(key) ?? {
        documentType: doc.documentType,
        version: doc.version,
        applicationIds: new Set<string>(),
      };
      group.applicationIds.add(doc.applicationId);
      groups.set(key, group);
    }

    return Array.from(groups.values())
      .map((group) => {
        const applicationCount = group.applicationIds.size;
        const interviewCount = Array.from(group.applicationIds).filter((id) =>
          applicationIdsWithInterview.has(id),
        ).length;
        return {
          documentType: group.documentType,
          version: group.version,
          applicationCount,
          interviewCount,
          interviewRate:
            applicationCount > 0 ? Math.round((interviewCount / applicationCount) * 100) : 0,
        };
      })
      .sort((a, b) => b.applicationCount - a.applicationCount);
  }
}
