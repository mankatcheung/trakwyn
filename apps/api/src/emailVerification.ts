#!/usr/bin/env tsx
/**
 * Operator command for the email-verification wall (JEF-438): mark accounts
 * that predate it as verified, so switching the wall on does not lock them out.
 *
 * Usage:
 *   pnpm --filter @trakwyn/api email-verification backfill --before 2026-11-01 --dry-run
 *   pnpm --filter @trakwyn/api email-verification backfill --before 2026-11-01
 *
 * Run the dry run first: it reports how many accounts the cutoff would verify
 * and how many unverified accounts it would leave behind the wall.
 *
 * Needs `DATABASE_URL`. Against production, point it at Neon's *direct* URL as
 * `db:migrate` does. It writes to the database directly, so a running API
 * serves the old state from its user cache for up to five minutes: an affected
 * user may still see the reminder for that long.
 *
 * Opens its own handle and closes it when done, as `plan.ts` does: left open, a
 * PGlite handle keeps the process alive after the last write.
 */
import 'dotenv/config';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createDb } from '#src/infrastructure/db/createDb.js';
import { parseEmailVerificationCommand } from '#src/infrastructure/cli/parseEmailVerificationCommand.js';
import { DrizzleUserRepository } from '#src/infrastructure/db/repositories/DrizzleUserRepository.js';
import { BackfillEmailVerificationUseCase } from '#src/use-cases/auth/BackfillEmailVerificationUseCase.js';

let command;
try {
  command = parseEmailVerificationCommand(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const databaseUrl = process.env[ENV.DATABASE_URL];
if (!databaseUrl) {
  console.error(`${ENV.DATABASE_URL} is required`);
  process.exit(1);
}

const { db, close } = await createDb(databaseUrl);
try {
  const userRepository = new DrizzleUserRepository({ db });
  const summary = await new BackfillEmailVerificationUseCase({
    userRepository,
    now: () => new Date(),
  }).execute({ before: command.before, dryRun: command.dryRun });

  console.log(
    `${command.dryRun ? 'Would mark' : 'Marked'} ${summary.verified} user(s) created before ` +
      `${command.before.toISOString()} as verified; ${summary.alreadyVerified} already verified; ` +
      `${summary.remaining} unverified user(s) remain behind the wall.`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await close();
}
