import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import type { DrizzleDb } from '../../infrastructure/db/client.js';
import {
  documentDraft,
  jobApplication,
  resumeAtsScore,
  resumeMatch,
} from '../../infrastructure/db/schema.js';
import { hashResumeText } from '../../use-cases/shared/hashResumeText.js';
import { proseToTiptapDoc } from '../../use-cases/shared/proseToTiptapDoc.js';
import { scoreResumeText } from '../../use-cases/shared/scoreResumeText.js';
import { resumeToTiptapDoc } from '../../use-cases/shared/resumeToTiptapDoc.js';
import { coverLetters } from '../data/coverLetters.js';
import { GENERATED_RESUME, resumes } from '../data/resumes.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resume and cover letter drafts, with the saved Resume Match and the saved
 * ATS-readiness result for most resumes. The ATS result is scored from each
 * resume's text, so the resumes themselves are what vary: from complete to
 * thin, symbol-heavy, missing contact details, and empty.
 */
export async function seedDocuments(db: DrizzleDb, userId: string, now: Date): Promise<void> {
  const findApplicationId = async (company: string): Promise<string> => {
    const [row] = await db
      .select({ id: jobApplication.id })
      .from(jobApplication)
      .where(and(eq(jobApplication.userId, userId), eq(jobApplication.company, company)))
      .limit(1);
    if (!row) throw new Error(`Seed document references an unknown application: ${company}`);
    return row.id;
  };

  for (const [index, resume] of resumes.entries()) {
    const applicationId = await findApplicationId(resume.company);
    const content =
      resume.company === 'Linear'
        ? resumeToTiptapDoc(GENERATED_RESUME)
        : proseToTiptapDoc(resume.text);
    const draftId = nanoid();
    const editedAt = new Date(now.getTime() - (index + 1) * DAY_MS);

    await db.insert(documentDraft).values({
      id: draftId,
      applicationId,
      type: 'resume',
      title: resume.title,
      contentJson: content.contentJson,
      plainText: content.plainText,
      createdAt: editedAt,
      updatedAt: editedAt,
    });

    if (resume.ats !== 'none') {
      const { checks, ...scored } = scoreResumeText(content.plainText);
      await db.insert(resumeAtsScore).values({
        id: nanoid(),
        applicationId,
        documentDraftId: draftId,
        ...scored,
        checksJson: JSON.stringify(checks),
        generatedAt: editedAt,
        // A stale result was scored against different text, so its hash no longer fits the draft.
        resumeTextHash: hashResumeText(
          resume.ats === 'stale' ? `${content.plainText}\n(earlier version)` : content.plainText,
        ),
      });
    }

    if (resume.match) {
      const { match } = resume;
      await db.insert(resumeMatch).values({
        id: nanoid(),
        applicationId,
        documentDraftId: draftId,
        score: match.score,
        label: match.label,
        matchedKeywords: JSON.stringify(match.matchedKeywords),
        missingKeywords: JSON.stringify(match.missingKeywords),
        summary: match.summary,
        generatedAt: editedAt,
        // A stale match was scored against different text, so its hash no longer fits the draft.
        resumeTextHash: hashResumeText(
          match.stale ? `${content.plainText}\n(earlier version)` : content.plainText,
        ),
      });
    }
  }

  for (const [index, letterSeed] of coverLetters.entries()) {
    const content = proseToTiptapDoc(letterSeed.text);
    const editedAt = new Date(now.getTime() - (index + 1) * DAY_MS);
    await db.insert(documentDraft).values({
      id: nanoid(),
      applicationId: await findApplicationId(letterSeed.company),
      type: 'cover_letter',
      title: letterSeed.title,
      contentJson: content.contentJson,
      plainText: content.plainText,
      createdAt: editedAt,
      updatedAt: editedAt,
    });
  }
}
