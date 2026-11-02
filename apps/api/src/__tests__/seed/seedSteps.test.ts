import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import { notInArray } from 'drizzle-orm';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import {
  user,
  jobApplication,
  offer,
  applicationTag,
  note,
  activityLog,
  contact,
  interviewRound,
  workExperience,
  education,
  skill,
  conversation,
  message,
  notification,
} from '#src/infrastructure/db/schema.js';
import { seedApplications } from '#src/seed/steps/applications.js';
import { seedWorkExperiences } from '#src/seed/steps/workExperiences.js';
import { seedEducations } from '#src/seed/steps/educations.js';
import { seedSkills } from '#src/seed/steps/skills.js';
import { seedConversations } from '#src/seed/steps/conversations.js';
import { seedNotifications } from '#src/seed/steps/notifications.js';

describe('seed steps', () => {
  let db: TestDb;
  let userId: string;
  const now = new Date('2025-06-01T12:00:00.000Z');

  beforeAll(async () => {
    db = await createTestDb();
    userId = nanoid();
    await db.db.insert(user).values({
      id: userId,
      email: 'seed-test@jobfinder.app',
      name: 'Seed Test',
      timezone: 'UTC',
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(() => db.cleanup());

  it('seeds job applications with all related rows', async () => {
    await seedApplications(db.db, userId, now);

    const apps = await db.db.select().from(jobApplication);
    expect(apps).toHaveLength(15);

    // The two "Quota Demo" applications (JEF-494) are `applied` and sit at 80% and
    // 100% of the per-application caps, so they add to every total below.
    const byStatus = (status: string) => apps.filter((a) => a.status === status);
    expect(byStatus('draft')).toHaveLength(2);
    expect(byStatus('applied')).toHaveLength(5);
    expect(byStatus('interviewing')).toHaveLength(3);
    expect(byStatus('offered')).toHaveLength(2);
    expect(byStatus('rejected')).toHaveLength(2);
    expect(byStatus('withdrawn')).toHaveLength(1);

    expect((await db.db.select().from(offer)).length).toBe(4 + 8 + 10);
    expect((await db.db.select().from(applicationTag)).length).toBe(36 + 16 + 20);
    expect((await db.db.select().from(note)).length).toBe(24 + 80 + 100);
    expect((await db.db.select().from(contact)).length).toBe(11 + 20 + 25);
    expect((await db.db.select().from(interviewRound)).length).toBe(19 + 12 + 15);
    expect((await db.db.select().from(activityLog)).length).toBe(56 + 2 + 180 + 27);

    const appIds = apps.map((a) => a.id);
    const orphanOffers = await db.db
      .select()
      .from(offer)
      .where(notInArray(offer.applicationId, appIds));
    expect(orphanOffers).toHaveLength(0);
  });

  it('seeds work experience, education, and skills', async () => {
    await seedWorkExperiences(db.db, userId, now);
    await seedEducations(db.db, userId, now);
    await seedSkills(db.db, userId, now);

    expect((await db.db.select().from(workExperience)).length).toBe(3);
    expect((await db.db.select().from(education)).length).toBe(2);
    expect((await db.db.select().from(skill)).length).toBe(23);
  });

  it('seeds conversations and their messages', async () => {
    await seedConversations(db.db, userId, now);

    const convs = await db.db.select().from(conversation);
    expect(convs).toHaveLength(2);

    const messages = await db.db.select().from(message);
    expect(messages).toHaveLength(6);

    const convIds = convs.map((c) => c.id);
    const orphanMessages = await db.db
      .select()
      .from(message)
      .where(notInArray(message.conversationId, convIds));
    expect(orphanMessages).toHaveLength(0);
  });

  it('seeds notifications', async () => {
    await seedNotifications(db.db, userId);

    const notifs = await db.db.select().from(notification);
    expect(notifs).toHaveLength(5);
    expect(new Set(notifs.map((n) => n.type))).toEqual(
      new Set(['interview_reminder', 'follow_up_reminder', 'security_alert']),
    );
  });
});
