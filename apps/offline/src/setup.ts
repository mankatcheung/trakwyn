import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createClient } from '@libsql/client';

export async function setupDatabase(databaseUrl: string): Promise<void> {
  console.log('Setting up database...');

  const client = createClient({
    url: databaseUrl,
  });

  // Enable foreign keys
  await client.execute('PRAGMA foreign_keys = ON');

  // Check if tables exist
  const result = await client.execute(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='User'
  `);

  if (result.rows.length === 0) {
    console.log('Creating database schema...');
    await runMigrations(client);
  } else {
    console.log('Database already initialized.');
  }

  await client.close();
}

async function runMigrations(client: ReturnType<typeof createClient>): Promise<void> {
  // Read and execute the migration SQL file
  const migrationsDir = join(import.meta.dirname, '..', '..', 'api', 'drizzle');

  if (!existsSync(migrationsDir)) {
    console.log('No migrations directory found. Creating tables directly...');
    await createTables(client);
    return;
  }

  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const filePath = join(migrationsDir, file);
    const { readFileSync } = await import('fs');
    const sql = readFileSync(filePath, 'utf-8');

    // Split by statement-breakpoint and execute each statement
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      try {
        await client.execute(statement);
      } catch (error) {
        // Ignore errors for tables that already exist
        if (!(error instanceof Error && error.message?.includes('already exists'))) {
          console.error(`Error executing statement: ${statement.slice(0, 100)}...`);
          console.error(error);
        }
      }
    }
  }

  console.log('Migrations applied successfully.');
}

async function createTables(client: ReturnType<typeof createClient>): Promise<void> {
  // Create all tables directly if migrations are not available
  const schema = `
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      passwordHash TEXT,
      name TEXT,
      timezone TEXT,
      targetRole TEXT,
      emailVerifiedAt INTEGER,
      avatarKey TEXT,
      weeklyDigestEnabled INTEGER DEFAULT true NOT NULL,
      lastDigestSentAt INTEGER,
      followUpRemindersEnabled INTEGER DEFAULT true NOT NULL,
      totpSecret TEXT,
      totpEnabled INTEGER DEFAULT false NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS User_email_unique ON User (email);

    CREATE TABLE IF NOT EXISTS OAuthAccount (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      provider TEXT NOT NULL,
      providerAccountId TEXT NOT NULL,
      email TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE UNIQUE INDEX IF NOT EXISTS OAuthAccount_provider_providerAccountId_key ON OAuthAccount (provider, providerAccountId);
    CREATE INDEX IF NOT EXISTS OAuthAccount_userId_idx ON OAuthAccount (userId);

    CREATE TABLE IF NOT EXISTS TotpBackupCode (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      codeHash TEXT NOT NULL,
      usedAt INTEGER,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE UNIQUE INDEX IF NOT EXISTS TotpBackupCode_codeHash_unique ON TotpBackupCode (codeHash);
    CREATE INDEX IF NOT EXISTS TotpBackupCode_userId_idx ON TotpBackupCode (userId);

    CREATE TABLE IF NOT EXISTS LoginEvent (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE INDEX IF NOT EXISTS LoginEvent_userId_idx ON LoginEvent (userId);

    CREATE TABLE IF NOT EXISTS Session (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      userAgent TEXT,
      ipAddress TEXT,
      lastUsedAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL,
      revokedAt INTEGER,
      FOREIGN KEY (userId) REFERENCES User(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE INDEX IF NOT EXISTS Session_userId_idx ON Session (userId);

    CREATE TABLE IF NOT EXISTS EmailVerificationToken (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL,
      newEmail TEXT,
      expiresAt INTEGER NOT NULL,
      usedAt INTEGER,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE UNIQUE INDEX IF NOT EXISTS EmailVerificationToken_tokenHash_unique ON EmailVerificationToken (tokenHash);
    CREATE INDEX IF NOT EXISTS EmailVerificationToken_userId_idx ON EmailVerificationToken (userId);

    CREATE TABLE IF NOT EXISTS PasswordResetToken (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      usedAt INTEGER,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE UNIQUE INDEX IF NOT EXISTS PasswordResetToken_tokenHash_unique ON PasswordResetToken (tokenHash);
    CREATE INDEX IF NOT EXISTS PasswordResetToken_userId_idx ON PasswordResetToken (userId);

    CREATE TABLE IF NOT EXISTS ApiToken (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      tokenHash TEXT NOT NULL,
      scope TEXT DEFAULT 'full' NOT NULL,
      lastUsedAt INTEGER,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ApiToken_tokenHash_unique ON ApiToken (tokenHash);
    CREATE INDEX IF NOT EXISTS ApiToken_userId_idx ON ApiToken (userId);

    CREATE TABLE IF NOT EXISTS JobApplication (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      jobUrl TEXT,
      location TEXT,
      salaryRange TEXT,
      description TEXT,
      appliedAt INTEGER,
      starred INTEGER DEFAULT false NOT NULL,
      source TEXT,
      followUpAt INTEGER,
      reminderSentAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE INDEX IF NOT EXISTS JobApplication_userId_idx ON JobApplication (userId);
    CREATE INDEX IF NOT EXISTS JobApplication_userId_status_idx ON JobApplication (userId, status);

    CREATE TABLE IF NOT EXISTS ApplicationTag (
      id TEXT PRIMARY KEY NOT NULL,
      applicationId TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (applicationId) REFERENCES JobApplication(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ApplicationTag_applicationId_name_key ON ApplicationTag (applicationId, name);
    CREATE INDEX IF NOT EXISTS ApplicationTag_applicationId_idx ON ApplicationTag (applicationId);

    CREATE TABLE IF NOT EXISTS ActivityLog (
      id TEXT PRIMARY KEY NOT NULL,
      applicationId TEXT NOT NULL,
      actorId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (applicationId) REFERENCES JobApplication(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE INDEX IF NOT EXISTS ActivityLog_applicationId_idx ON ActivityLog (applicationId);

    CREATE TABLE IF NOT EXISTS InterviewRound (
      id TEXT PRIMARY KEY NOT NULL,
      applicationId TEXT NOT NULL,
      type TEXT DEFAULT 'other' NOT NULL,
      scheduledAt INTEGER,
      completedAt INTEGER,
      interviewerName TEXT,
      notes TEXT,
      outcome TEXT DEFAULT 'pending' NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (applicationId) REFERENCES JobApplication(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE INDEX IF NOT EXISTS InterviewRound_applicationId_idx ON InterviewRound (applicationId);

    CREATE TABLE IF NOT EXISTS Note (
      id TEXT PRIMARY KEY NOT NULL,
      applicationId TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (applicationId) REFERENCES JobApplication(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE INDEX IF NOT EXISTS Note_applicationId_idx ON Note (applicationId);

    CREATE TABLE IF NOT EXISTS Document (
      id TEXT PRIMARY KEY NOT NULL,
      applicationId TEXT NOT NULL,
      name TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL,
      storageKey TEXT NOT NULL,
      documentType TEXT DEFAULT 'other' NOT NULL,
      version TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (applicationId) REFERENCES JobApplication(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE UNIQUE INDEX IF NOT EXISTS Document_storageKey_unique ON Document (storageKey);
    CREATE INDEX IF NOT EXISTS Document_applicationId_idx ON Document (applicationId);

    CREATE TABLE IF NOT EXISTS Contact (
      id TEXT PRIMARY KEY NOT NULL,
      applicationId TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      email TEXT,
      phone TEXT,
      linkedinUrl TEXT,
      notes TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (applicationId) REFERENCES JobApplication(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE INDEX IF NOT EXISTS Contact_applicationId_idx ON Contact (applicationId);
  `;

  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await client.execute(statement);
    } catch (error) {
      // Ignore errors for tables/indexes that already exist
      if (!(error instanceof Error && error.message?.includes('already exists'))) {
        console.error(`Error creating table: ${statement.slice(0, 50)}...`);
        console.error(error);
      }
    }
  }
}
