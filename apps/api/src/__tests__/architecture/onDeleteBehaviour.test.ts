import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '#src/infrastructure/db/schema.js';

/**
 * Every delete in this schema is a hard delete — there is no `deletedAt`
 * anywhere — so what a foreign key does on delete is the whole of the
 * retention policy. It is written here rather than inferred, because it is
 * currently `cascade` on 31 of 33 keys and a new table that says nothing
 * inherits that by default.
 *
 * Adding a foreign key therefore fails this test until it is listed. That is
 * the point: the decision gets made once, by someone who has thought about it,
 * rather than arrived at by copying the table above.
 *
 * Read via Drizzle's own table metadata. An earlier pass over these same
 * relationships with a regex over the schema source reported "no set null
 * anywhere", missing both of the ones below.
 */
const DECLARED_ON_DELETE: Record<string, string> = {
  'ActivityLog -> JobApplication': 'cascade', // an application's history is part of the application; see the note below
  'ApiToken -> User': 'cascade',
  'ApplicationTag -> JobApplication': 'cascade',
  'BackupEmailVerificationToken -> User': 'cascade',
  'CompanyBriefing -> JobApplication': 'cascade', // research about the company, meaningless without the application
  'Contact -> JobApplication': 'cascade',
  'Conversation -> User': 'cascade',
  'Document -> DocumentDraft': 'set null', // a draft and its exported file reference each other; neither owns the other
  'Document -> JobApplication': 'cascade',
  'DocumentDraft -> Document': 'set null', // a draft and its exported file reference each other; neither owns the other
  'DocumentDraft -> JobApplication': 'cascade',
  'Education -> User': 'cascade',
  'EmailVerificationToken -> User': 'cascade',
  'InterviewRound -> JobApplication': 'cascade',
  'JobApplication -> User': 'cascade',
  'LlmApiKey -> User': 'cascade',
  'LlmUsageEvent -> User': 'cascade',
  'LoginEvent -> User': 'cascade', // erasure beats retention — these rows hold IP, device and location
  'McpOAuthAccessToken -> User': 'cascade',
  'McpOAuthAuthorizationCode -> McpOAuthClient': 'cascade',
  'McpOAuthAuthorizationCode -> User': 'cascade',
  'McpOAuthRefreshToken -> User': 'cascade',
  'Message -> Conversation': 'cascade',
  'Note -> JobApplication': 'cascade',
  'Notification -> User': 'cascade',
  'OAuthAccount -> User': 'cascade',
  'Offer -> JobApplication': 'cascade',
  'PasswordResetToken -> User': 'cascade',
  'PushSubscription -> User': 'cascade',
  'SecurityEvent -> User': 'cascade', // erasure beats retention — these rows hold IP, device and location
  'Session -> User': 'cascade',
  'ShareLink -> User': 'cascade',
  'Skill -> User': 'cascade',
  'TotpBackupCode -> User': 'cascade',
  'WorkExperience -> User': 'cascade',
};

function actualForeignKeys(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const table of Object.values(schema)) {
    let config;
    try {
      config = getTableConfig(table as never);
    } catch {
      continue; // not a table — the module also exports types and helpers
    }
    for (const fk of config.foreignKeys) {
      const parent = fk.reference().foreignTable as unknown as Record<symbol, string>;
      const parentName = parent[Symbol.for('drizzle:Name')];
      found[`${config.name} -> ${parentName}`] = fk.onDelete ?? 'no action';
    }
  }
  return found;
}

describe('on-delete behaviour is declared, not inherited', () => {
  it('every foreign key in the schema is listed', () => {
    const undeclared = Object.keys(actualForeignKeys()).filter((k) => !(k in DECLARED_ON_DELETE));

    // A new table defaulting to cascade is how the audit tables ended up
    // cascading: nobody chose it for them.
    expect(undeclared).toEqual([]);
  });

  it('no listed foreign key has quietly changed action', () => {
    const actual = actualForeignKeys();
    const changed = Object.entries(DECLARED_ON_DELETE)
      .filter(([edge, action]) => edge in actual && actual[edge] !== action)
      .map(([edge, action]) => `${edge}: declared ${action}, found ${actual[edge]}`);

    expect(changed).toEqual([]);
  });

  it('has no listed foreign key that no longer exists', () => {
    const actual = actualForeignKeys();
    const stale = Object.keys(DECLARED_ON_DELETE).filter((k) => !(k in actual));

    expect(stale).toEqual([]);
  });

  it('read a realistic number of relationships', () => {
    // Guards the guard: if the schema import ever resolves to nothing, every
    // assertion above passes vacuously.
    expect(Object.keys(actualForeignKeys()).length).toBeGreaterThan(25);
  });
});
