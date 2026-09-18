import type { DrizzleDb } from '#src/infrastructure/db/client.js';
import { eq } from 'drizzle-orm';
import { pushSubscription } from '#src/infrastructure/db/schema.js';
import type { IPushSubscriptionRepository } from '#src/use-cases/ports/IPushSubscriptionRepository.js';
import type { PushSubscription } from '#src/domain/pushSubscription/PushSubscription.js';

interface Deps {
  db: DrizzleDb;
  generateId: () => string;
}

export class DrizzlePushSubscriptionRepository implements IPushSubscriptionRepository {
  constructor(private readonly deps: Deps) {}

  async findByUserId(userId: string): Promise<PushSubscription[]> {
    const rows = await this.deps.db
      .select()
      .from(pushSubscription)
      .where(eq(pushSubscription.userId, userId));
    return rows.map(this.toDomain);
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscription | null> {
    const rows = await this.deps.db
      .select()
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, endpoint))
      .limit(1);
    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async upsert(sub: Omit<PushSubscription, 'createdAt' | 'updatedAt'>): Promise<PushSubscription> {
    const now = new Date();
    await this.deps.db
      .insert(pushSubscription)
      .values({
        id: sub.id,
        userId: sub.userId,
        provider: sub.provider,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: {
          provider: sub.provider,
          p256dh: sub.p256dh,
          auth: sub.auth,
          userId: sub.userId,
          updatedAt: now,
        },
      });
    return { ...sub, createdAt: now, updatedAt: now };
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.deps.db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.deps.db.delete(pushSubscription).where(eq(pushSubscription.userId, userId));
  }

  private toDomain(row: typeof pushSubscription.$inferSelect): PushSubscription {
    return {
      id: row.id,
      userId: row.userId,
      provider: row.provider,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
