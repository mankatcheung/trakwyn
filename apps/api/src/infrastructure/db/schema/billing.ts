import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { user } from './user.js';

/**
 * Payment-provider events already applied (JEF-426). The provider's own event
 * id is the key, so a redelivery cannot be recorded twice. `userId` is null
 * for an event that named nobody we know.
 */
export const billingEvent = pgTable('BillingEvent', {
  id: text('id').primaryKey(),
  userId: text('userId').references(() => user.id, { onDelete: 'cascade' }),
  processedAt: timestamp('processedAt', TIMESTAMP)
    .notNull()
    .$defaultFn(() => new Date()),
});
