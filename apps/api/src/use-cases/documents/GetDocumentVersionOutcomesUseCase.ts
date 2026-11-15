import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import { pickGeneratedResumeDraft } from '#src/use-cases/documents/generatedResume.js';
import { DOCUMENT_TYPE } from '#src/use-cases/constants.js';
import type { Application } from '#src/domain/application/Application.js';
import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';

/** The `version` of the row for resumes written by Trakwyn's AI (JEF-598). */
export const GENERATED_RESUME_VERSION = 'Generated';

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
  documentDraftRepository: IDocumentDraftRepository;
  applicationRepository: IApplicationRepository;
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
 * Resumes written in Trakwyn have no upload, so they are one more row,
 * `version: 'Generated'` (JEF-598): each application counts once, with the
 * resume `pickGeneratedResumeDraft` says it went out with, and only when the
 * AI wrote that draft. It is its own group even if a user typed "Generated" as
 * an upload's version label, and then both rows are shown.
 *
 * `version` is free-text and optional at upload time (no normalization or
 * required-field enforcement exists yet), so documents with no version set
 * are grouped together under `version: null` rather than dropped.
 */
export class GetDocumentVersionOutcomesUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetDocumentVersionOutcomesInput): Promise<DocumentVersionOutcome[]> {
    await this.deps.entitlementService.assertFeature(input.userId, 'analytics');
    const [documents, interviewRounds, resumeDrafts, applications] = await Promise.all([
      this.deps.documentRepository.findAllByUserId(input.userId),
      this.deps.interviewRoundRepository.findAllByUserId(input.userId),
      this.deps.documentDraftRepository.findResumeDraftsByUserId(input.userId),
      this.deps.applicationRepository.findAllByUserId(input.userId),
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

    const generated: Group = {
      documentType: DOCUMENT_TYPE.RESUME,
      version: GENERATED_RESUME_VERSION,
      applicationIds: this.generatedApplicationIds(resumeDrafts, applications),
    };
    const allGroups = [
      ...groups.values(),
      ...(generated.applicationIds.size > 0 ? [generated] : []),
    ];

    return allGroups
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

  /** The applications whose chosen resume draft was written by the AI. */
  private generatedApplicationIds(
    drafts: readonly DocumentDraft[],
    applications: readonly Application[],
  ): Set<string> {
    const appliedAtById = new Map(applications.map((app) => [app.id, app.appliedAt]));
    const draftsByApplication = new Map<string, DocumentDraft[]>();
    for (const draft of drafts) {
      // An application in the trash is not among `applications`, so it drops out here.
      if (!appliedAtById.has(draft.applicationId)) continue;
      draftsByApplication.set(draft.applicationId, [
        ...(draftsByApplication.get(draft.applicationId) ?? []),
        draft,
      ]);
    }
    const ids = new Set<string>();
    for (const [applicationId, list] of draftsByApplication) {
      if (pickGeneratedResumeDraft(list, appliedAtById.get(applicationId) ?? null)) {
        ids.add(applicationId);
      }
    }
    return ids;
  }
}
