import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';

/**
 * Anonymous cookie-consent decisions (JEF-211) — no `userId` FK, since these
 * are recorded before/without an account existing. Not covered by
 * `onDeleteBehaviour.test.ts`'s foreign-key sweep for that reason.
 */
export const cookieConsent = pgTable('CookieConsent', {
  id: text('id').primaryKey(),
  analyticsAccepted: boolean('analyticsAccepted').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  consentedAt: timestamp('consentedAt', TIMESTAMP)
    .notNull()
    .$defaultFn(() => new Date()),
});
