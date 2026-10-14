import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { documentDraft, resumeMatch, user } from '#src/infrastructure/db/schema.js';
import { seedApplications } from '#src/seed/steps/applications.js';
import { seedDocuments } from '#src/seed/steps/documents.js';
import { hashResumeText } from '#src/use-cases/shared/hashResumeText.js';
import { scoreResumeText } from '#src/use-cases/shared/scoreResumeText.js';

describe('seedDocuments', () => {
  let db: TestDb;
  const now = new Date('2026-10-14T12:00:00.000Z');

  beforeAll(async () => {
    db = await createTestDb();
    const userId = nanoid();
    await db.db.insert(user).values({
      id: userId,
      email: 'seed-documents@example.com',
      name: 'Seed Documents',
      timezone: 'UTC',
      createdAt: now,
      updatedAt: now,
    });
    await seedApplications(db.db, userId, now);
    await seedDocuments(db.db, userId, now);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  const drafts = (type: 'resume' | 'cover_letter') =>
    db.db.select().from(documentDraft).where(eq(documentDraft.type, type));

  it('seeds resumes and cover letters on their applications', async () => {
    expect(await drafts('resume')).toHaveLength(6);
    expect(await drafts('cover_letter')).toHaveLength(5);
  });

  it('gives cover letters real text the editor can open', async () => {
    for (const letter of await drafts('cover_letter')) {
      expect(letter.plainText).toMatch(/^Dear .+ hiring team,/);
      expect(JSON.parse(letter.contentJson).type).toBe('doc');
    }
  });

  it('spans the ATS-readiness score, so a demo shows every outcome', async () => {
    const byTitle = Object.fromEntries(
      (await drafts('resume')).map((d) => [d.title, scoreResumeText(d.plainText)]),
    );

    expect(byTitle['Frontend Resume (Acme)']).toMatchObject({ score: 100, label: 'Excellent' });
    expect(byTitle['Resume (generated for Linear)']).toMatchObject({ score: 75, label: 'Good' });
    expect(byTitle['Full Stack Resume']).toMatchObject({ score: 71, label: 'Good' });
    expect(byTitle['Staff Engineer Resume']).toMatchObject({ score: 80, label: 'Good' });
    expect(byTitle['Quick resume draft']).toMatchObject({ score: 18, label: 'Needs work' });
    expect(byTitle['Resume (draft)']).toMatchObject({ score: 0, readable: false });
  });

  it('saves a Resume Match for every resume that has content', async () => {
    const matches = await db.db.select().from(resumeMatch);
    expect(matches).toHaveLength(5);
    expect(matches.every((m) => m.documentId === null && m.documentDraftId !== null)).toBe(true);
  });

  it('marks exactly one match as out of date by its text hash', async () => {
    const resumes = await drafts('resume');
    const matches = await db.db.select().from(resumeMatch);
    const stale = matches.filter((m) => {
      const draft = resumes.find((d) => d.id === m.documentDraftId);
      return draft && m.resumeTextHash !== hashResumeText(draft.plainText);
    });

    expect(stale).toHaveLength(1);
    expect(resumes.find((d) => d.id === stale[0].documentDraftId)?.title).toBe('Full Stack Resume');
  });
});
