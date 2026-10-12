import { documentCategory, type DocumentCategory } from '../../documents/lib/documentCategory';

/** What the API's `sectionCounts` returns for the sections it can count. */
export interface ApiSectionCounts {
  notes: number;
  interviews: number;
  contacts: number;
  offers: number;
  /** Whether a briefing has been generated: at most one exists, so a flag, not a count. */
  companyBriefing: boolean;
}

/**
 * The three document tabs, derived on the client from the documents and drafts
 * lists because the API counts only totals and a badge has to count its own
 * category (the same split as web's `documentSectionCounts`).
 */
export interface DocumentSectionCounts {
  coverLetters: number;
  resumes: number;
  otherDocuments: number;
}

export type SectionCounts = ApiSectionCounts & DocumentSectionCounts;

export function documentSectionCounts(
  documents: readonly { documentType: string }[],
  drafts: readonly { type: string }[],
): DocumentSectionCounts {
  const count = (category: DocumentCategory) =>
    documents.filter((d) => documentCategory(d.documentType) === category).length +
    drafts.filter((d) => documentCategory(d.type) === category).length;
  return {
    coverLetters: count('cover_letter'),
    resumes: count('resume'),
    otherDocuments: count('other'),
  };
}
