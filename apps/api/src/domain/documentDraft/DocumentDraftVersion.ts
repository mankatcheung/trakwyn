/** Why a snapshot of a draft was taken (JEF-584). */
export const DRAFT_VERSION_SOURCES = ['autosave', 'ai', 'manual', 'restore'] as const;
export type DraftVersionSource = (typeof DRAFT_VERSION_SOURCES)[number];

/**
 * A saved copy of a draft's content, so an earlier state can be read and
 * restored after the AI helper or an edit replaced it. Whole-content copies, not
 * diffs: drafts are small.
 */
export interface DocumentDraftVersion {
  id: string;
  draftId: string;
  contentJson: string;
  plainText: string;
  source: DraftVersionSource;
  createdAt: Date;
}
