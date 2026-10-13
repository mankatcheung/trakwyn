import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { INoteRepository } from '#src/use-cases/ports/INoteRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IContactRepository } from '#src/use-cases/ports/IContactRepository.js';
import type { IOfferRepository } from '#src/use-cases/ports/IOfferRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';

export interface ApplicationSectionCounts {
  notes: number;
  interviews: number;
  contacts: number;
  documents: number;
  documentDrafts: number;
  offers: number;
  /** Whether a briefing has been generated; a flag, not a count, as there is at most one. */
  companyBriefing: boolean;
}

export interface GetApplicationSectionCountsInput {
  userId: string;
  applicationId: string;
}

export interface IGetApplicationSectionCountsUseCase {
  execute(input: GetApplicationSectionCountsInput): Promise<ApplicationSectionCounts>;
}

interface Deps {
  applicationRepository: IApplicationRepository;
  noteRepository: INoteRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  contactRepository: IContactRepository;
  offerRepository: IOfferRepository;
  documentRepository: IDocumentRepository;
  documentDraftRepository: IDocumentDraftRepository;
  companyBriefingRepository: ICompanyBriefingRepository;
}

/**
 * How much is in each section of an application, for the detail page's index.
 *
 * The index exists so you can tell an empty section from a full one without
 * opening it, which means every section reports a number — zero included. An
 * omitted key would render identically to "not loaded yet" (JEF-208).
 *
 * Ownership is checked once, up front, so a refused application costs no
 * counting queries at all.
 */
export class GetApplicationSectionCountsUseCase implements IGetApplicationSectionCountsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetApplicationSectionCountsInput): Promise<ApplicationSectionCounts> {
    // findById filters trashed applications out, so a trashed one reports as
    // missing rather than serving counts.
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const id = input.applicationId;
    const [notes, interviews, contacts, documents, documentDrafts, offers, briefing] =
      await Promise.all([
        this.deps.noteRepository.countByApplicationId(id),
        this.deps.interviewRoundRepository.countByApplicationId(id),
        this.deps.contactRepository.countByApplicationId(id),
        this.deps.documentRepository.countByApplicationId(id),
        this.deps.documentDraftRepository.countByApplicationId(id),
        this.deps.offerRepository.countByApplicationId(id),
        this.deps.companyBriefingRepository.findByApplicationId(id),
      ]);

    return {
      notes,
      interviews,
      contacts,
      documents,
      documentDrafts,
      offers,
      companyBriefing: briefing !== null,
    };
  }
}
