import type { QueryClient } from '@tanstack/react-query';
import { documentCategory, type DocumentCategory } from '#/lib/documentCategory';
import type { DocumentSectionCounts } from './-sections';

/**
 * The section index badges are their own cache entry (the detail page holds
 * the query), so anything that adds or removes a note, interview, contact,
 * document, draft or offer has to nudge it — otherwise the badge keeps saying
 * 3 over a list showing 2 (JEF-208).
 *
 * The key lives here rather than at each call site so a rename cannot leave
 * one tab quietly invalidating nothing.
 */
export const sectionCountsQueryKey = (applicationId: string) =>
  ['sectionCounts', applicationId] as const;

export function invalidateSectionCounts(qc: QueryClient, applicationId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: sectionCountsQueryKey(applicationId) });
}

/**
 * Per-category badge counts for the three document tabs, from the same lists
 * the tabs render, so a badge and its tab cannot disagree about what is in
 * which category.
 */
export function documentSectionCounts(
  documents: ReadonlyArray<{ documentType: string }>,
  drafts: ReadonlyArray<{ type: string }>,
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
