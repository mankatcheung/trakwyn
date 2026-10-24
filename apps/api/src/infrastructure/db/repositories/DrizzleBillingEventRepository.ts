import type { DrizzleDb, DrizzleClient } from '../client.js';
import { billingEvent } from '../schema.js';
import type { IBillingEventRepository } from '#src/use-cases/ports/IBillingEventRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleBillingEventRepository implements IBillingEventRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async tryRecord(eventId: string, userId: string | null): Promise<boolean> {
    const rows = await this.db
      .insert(billingEvent)
      .values({ id: eventId, userId })
      .onConflictDoNothing()
      .returning({ id: billingEvent.id });
    return rows.length > 0;
  }
}
