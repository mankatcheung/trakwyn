import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../../infrastructure/db/client.js';
import {
  jobApplication,
  user,
  applicationTag,
  note,
  activityLog,
  contact,
  interviewRound,
  offer,
} from '../../infrastructure/db/schema.js';
import { applications } from '../data/applications/index.js';

export async function seedApplications(db: DrizzleDb, userId: string, now: Date): Promise<void> {
  for (const [index, app] of applications.entries()) {
    // Not random: lists sort ties on `id`, and rows seeded in one instant tie,
    // so random ids would reorder them on every seed and change the guides'
    // screenshots (JEF-532). The demo user is deleted first, so none collide.
    const appId = `demo-app-${String(index).padStart(2, '0')}`;

    await db.insert(jobApplication).values({
      id: appId,
      userId,
      company: app.company,
      role: app.role,
      status: app.status,
      jobUrl: app.jobUrl,
      location: app.location,
      salaryRange: app.salaryRange,
      description: app.description,
      appliedAt: app.appliedAt,
      starred: app.starred,
      source: app.source,
      // An application is created when it is applied to, so analytics'
      // "Applications per week" spreads over the weeks instead of one bar.
      createdAt: app.appliedAt ?? now,
      updatedAt: now,
    });

    for (const offerEntry of app.offers ?? []) {
      await db.insert(offer).values({
        id: nanoid(),
        applicationId: appId,
        baseSalary: offerEntry.baseSalary,
        bonus: offerEntry.bonus,
        equity: offerEntry.equity,
        benefits: offerEntry.benefits,
        costOfLivingAdjustment: offerEntry.costOfLivingAdjustment,
        currency: offerEntry.currency,
        period: offerEntry.period,
        notes: offerEntry.notes,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Tags
    for (const tagName of app.tags) {
      await db.insert(applicationTag).values({
        id: nanoid(),
        applicationId: appId,
        name: tagName,
      });
    }

    // Notes
    for (const noteEntry of app.notes) {
      await db.insert(note).values({
        id: nanoid(),
        applicationId: appId,
        content: noteEntry.content,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(activityLog).values({
        id: nanoid(),
        applicationId: appId,
        actorId: userId,
        eventType: 'note_added',
        payload: JSON.stringify({ note: noteEntry.content.substring(0, 100) }),
        createdAt: now,
      });
    }

    // Contacts
    for (const contactEntry of app.contacts) {
      await db.insert(contact).values({
        id: nanoid(),
        applicationId: appId,
        name: contactEntry.name,
        role: contactEntry.role,
        email: contactEntry.email,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Interview rounds
    for (const round of app.interviewRounds) {
      await db.insert(interviewRound).values({
        id: nanoid(),
        applicationId: appId,
        type: round.type,
        scheduledAt: round.scheduledAt,
        completedAt: round.completedAt,
        interviewerName: round.interviewerName,
        outcome: round.outcome,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(activityLog).values({
        id: nanoid(),
        applicationId: appId,
        actorId: userId,
        eventType: 'interview_round_added',
        payload: JSON.stringify({ type: round.type, outcome: round.outcome }),
        createdAt: now,
      });
    }

    // Activity log for the application status
    await db.insert(activityLog).values({
      id: nanoid(),
      applicationId: appId,
      actorId: userId,
      eventType: 'status_change',
      payload: JSON.stringify({ status: app.status }),
      createdAt: now,
    });

    console.log(`  Created application: ${app.company} — ${app.role} (${app.status})`);
  }

  await db
    .update(user)
    .set({ applicationCount: applications.length, updatedAt: now })
    .where(eq(user.id, userId));
}
