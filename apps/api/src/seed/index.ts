import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../infrastructure/db/client.js';
import { user } from '../infrastructure/db/schema.js';
import { seedApplications } from './steps/applications.js';
import { seedWorkExperiences } from './steps/workExperiences.js';
import { seedEducations } from './steps/educations.js';
import { seedSkills } from './steps/skills.js';
import { seedConversations } from './steps/conversations.js';
import { seedNotifications } from './steps/notifications.js';

export const DEMO_EMAIL = 'demo@trakwyn.app';
export const DEMO_PASSWORD = 'demo1234';

/**
 * Takes the database rather than importing the process-wide client: that
 * client is never closed, and an open PGlite handle keeps the CLI from exiting.
 */
export async function runSeed(db: DrizzleDb): Promise<void> {
  const now = new Date();

  // Remove any previous demo user (cascading deletes handle related rows).
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEMO_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(user).where(eq(user.id, existing[0].id));
    console.log('  Removed existing demo user');
  }

  const userId = nanoid();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await db.insert(user).values({
    id: userId,
    email: DEMO_EMAIL,
    passwordHash,
    name: 'Demo User',
    timezone: 'America/New_York',
    targetRole: 'Senior Software Engineer',
    emailVerifiedAt: now,
    weeklyDigestEnabled: true,
    followUpRemindersEnabled: true,
    totpEnabled: false,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`  Created demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  await seedApplications(db, userId, now);
  await seedWorkExperiences(db, userId, now);
  await seedEducations(db, userId, now);
  await seedSkills(db, userId, now);
  await seedConversations(db, userId, now);
  await seedNotifications(db, userId);

  console.log('\nSeed complete!');
}
