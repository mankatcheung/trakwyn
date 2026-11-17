/**
 * The three places a document can live on an application, and which type
 * belongs to which. Drafts only ever carry `cover_letter` or `resume`; uploads
 * carry those two plus `portfolio`, `other` and whatever a future type is
 * called, so anything unrecognised lands in Other rather than disappearing
 * from every tab (JEF-396).
 */
export const DOCUMENT_CATEGORIES = ['cover_letter', 'resume', 'other'] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function documentCategory(type: string): DocumentCategory {
  if (type === 'cover_letter') return 'cover_letter';
  if (type === 'resume') return 'resume';
  return 'other';
}

/**
 * The upload types a tab may assign. Cover letters and Resumes imply theirs;
 * Other offers only the types that still belong to it — offering `resume`
 * there would save a file that then vanishes into a different tab.
 */
export const UPLOAD_TYPES_BY_CATEGORY: Record<DocumentCategory, readonly string[]> = {
  cover_letter: ['cover_letter'],
  resume: ['resume'],
  other: ['other', 'portfolio'],
};
