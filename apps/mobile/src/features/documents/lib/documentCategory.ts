/**
 * The three places a document can live on an application, and which type
 * belongs to which — the same split as web's `lib/documentCategory.ts`
 * (JEF-396). Drafts carry only `cover_letter` or `resume`; uploads also carry
 * `portfolio`, `other` and whatever a future type is called, so anything
 * unrecognised lands in Other rather than disappearing from every screen.
 */
export const DOCUMENT_CATEGORIES = ['cover_letter', 'resume', 'other'] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function documentCategory(type: string): DocumentCategory {
  if (type === 'cover_letter') return 'cover_letter';
  if (type === 'resume') return 'resume';
  return 'other';
}

/**
 * The upload types a screen may assign. Cover letters and Resumes imply theirs;
 * Other offers only the types that still belong to it, because offering
 * `resume` there would save a file that then vanishes into a different screen.
 */
export const UPLOAD_TYPES_BY_CATEGORY: Record<DocumentCategory, readonly string[]> = {
  cover_letter: ['cover_letter'],
  resume: ['resume'],
  other: ['other', 'portfolio'],
};
