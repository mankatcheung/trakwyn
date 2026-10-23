#!/usr/bin/env tsx
/**
 * Operator command for plans (JEF-344): put a user on a plan without a payment,
 * or give every existing user their launch trial.
 *
 * Usage:
 *   pnpm --filter @trakwyn/api plan set --email a@b.com --plan pro --days 30
 *   pnpm --filter @trakwyn/api plan set --email a@b.com --plan free
 *   pnpm --filter @trakwyn/api plan grant-trial --dry-run
 *   pnpm --filter @trakwyn/api plan grant-trial --days 30
 *
 * Needs `DATABASE_URL`. Against production, point it at Neon's *direct* URL as
 * `db:migrate` does. It writes to the database directly, so a running API
 * serves the old plan from its user cache for up to five minutes.
 *
 * Opens its own handle and closes it when done, as `migrate.ts` and `seed.ts`
 * do: left open, a PGlite handle keeps the process alive after the last write.
 */
import 'dotenv/config';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createDb } from '#src/infrastructure/db/createDb.js';
import { parsePlanCommand } from '#src/infrastructure/cli/parsePlanCommand.js';
import { DrizzleUserRepository } from '#src/infrastructure/db/repositories/DrizzleUserRepository.js';
import { GrantLaunchTrialUseCase } from '#src/use-cases/plans/GrantLaunchTrialUseCase.js';
import { SetUserPlanUseCase } from '#src/use-cases/plans/SetUserPlanUseCase.js';

let command;
try {
  command = parsePlanCommand(process.argv.slice(2));
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
  const now = () => new Date();

  if (command.kind === 'set') {
    const result = await new SetUserPlanUseCase({ userRepository, now }).execute({
      email: command.email,
      plan: command.plan,
      days: command.days,
    });
    console.log(
      `${result.email} is now on ${result.plan}` +
        (result.planExpiresAt ? ` until ${result.planExpiresAt.toISOString()}` : ''),
    );
  } else {
    const summary = await new GrantLaunchTrialUseCase({ userRepository, now }).execute({
      days: command.days,
      dryRun: command.dryRun,
    });
    console.log(
      `${command.dryRun ? 'Would grant' : 'Granted'} Pro until ${summary.endsAt.toISOString()} ` +
        `to ${summary.granted} user(s); skipped ${summary.skipped}.`,
    );
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await close();
}
