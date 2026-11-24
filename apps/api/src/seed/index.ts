import { NodeRsPasswordHasher } from '../infrastructure/auth/NodeRsPasswordHasher.js';
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
import { seedDocuments } from './steps/documents.js';
import { SEED_PROFILES, type SeedProfileName } from './profile.js';

export const DEMO_EMAIL = 'demo@trakwyn.app';
export const DEMO_PASSWORD = 'demo1234';

/**
 * Takes the database rather than importing the process-wide client: that
 * client is never closed, and an open PGlite handle keeps the CLI from exiting.
 *
 * Every date is relative to `now`. The guide screenshots pin it (JEF-532) so
 * the dates they show do not change with the calendar. The `marketing` profile
 * (JEF-684) is for the marketing screenshots: no quota demo rows, a fictional name.
 */
export async function runSeed(
  db: DrizzleDb,
  now: Date = new Date(),
  profileName: SeedProfileName = 'default',
): Promise<void> {
  const profile = SEED_PROFILES[profileName];
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
  const passwordHash = await new NodeRsPasswordHasher().hash(DEMO_PASSWORD);

  await db.insert(user).values({
    id: userId,
    email: DEMO_EMAIL,
    passwordHash,
    name: profile.persona.name,
    timezone: 'America/New_York',
    targetRole: 'Senior Software Engineer',
    emailVerifiedAt: now,
    // The demo account has data already; the first-run welcome flow (JEF-460) would only be in the way.
    onboardingCompletedAt: now,
    weeklyDigestEnabled: true,
    followUpRemindersEnabled: true,
    totpEnabled: false,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`  Created demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  await seedApplications(db, userId, now, profile);
  await seedDocuments(db, userId, now, profile.persona);
  await seedWorkExperiences(db, userId, now);
  await seedEducations(db, userId, now);
  await seedSkills(db, userId, now);
  await seedConversations(db, userId, now);
  await seedNotifications(db, userId);

  console.log('\nSeed complete!');
}
