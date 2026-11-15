import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';

/**
 * Which resume draft counts as "the resume this application went out with"
 * (JEF-598). Drafts are not attached to a submission, so it is a rule:
 *
 * - with an applied date, the most recently updated resume draft created on or
 *   before it (a draft written afterwards was not what was sent);
 * - without one, the most recently updated resume draft.
 *
 * The answer is the draft only when Trakwyn's AI wrote it (it has a
 * generation snapshot); a resume typed by hand is not a generated one, and a
 * draft with no snapshot says nothing about a prompt or a model. Pure, so the
 * outcomes panel and the first-interview event cannot disagree.
 */
export function pickGeneratedResumeDraft(
  drafts: readonly DocumentDraft[],
  appliedAt: Date | null,
): DocumentDraft | null {
  const resumes = drafts.filter((draft) => draft.type === 'resume');
  const eligible =
    appliedAt === null ? resumes : resumes.filter((draft) => draft.createdAt <= appliedAt);
  const latest = [...eligible].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  return latest?.generation ? latest : null;
}
