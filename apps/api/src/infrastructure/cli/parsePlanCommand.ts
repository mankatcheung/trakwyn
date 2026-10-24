import { parseArgs } from 'node:util';
import type { Plan } from '#src/domain/plan/Plan.js';

export const PLAN_USAGE = [
  'Usage:',
  '  pnpm --filter @trakwyn/api plan set --email <email> --plan <free|pro> [--days <n>]',
  '  pnpm --filter @trakwyn/api plan grant-trial [--days <n>] [--dry-run]',
].join('\n');

export type PlanCommand =
  | { kind: 'set'; email: string; plan: Plan; days: number | undefined }
  | { kind: 'grant-trial'; days: number | undefined; dryRun: boolean };

function fail(message: string): never {
  throw new Error(`${message}\n\n${PLAN_USAGE}`);
}

function parseDays(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(raw)) fail('--days must be a whole number of at least 1');
  return Number(raw);
}

/**
 * Reads the operator's `plan` command line (`set` or `grant-trial`). Throws an
 * `Error` whose message is the usage text, which the entrypoint prints.
 */
export function parsePlanCommand(argv: string[]): PlanCommand {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      email: { type: 'string' },
      plan: { type: 'string' },
      days: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  const [command, ...extra] = positionals;
  if (extra.length > 0) fail(`Unexpected argument "${extra[0]}"`);

  if (command === 'set') {
    if (!values.email) fail('set needs --email');
    if (!values.plan) fail('set needs --plan');
    if (values.plan !== 'free' && values.plan !== 'pro') fail('--plan must be free or pro');
    return { kind: 'set', email: values.email, plan: values.plan, days: parseDays(values.days) };
  }

  if (command === 'grant-trial') {
    return { kind: 'grant-trial', days: parseDays(values.days), dryRun: values['dry-run'] };
  }

  if (command === undefined) fail('Missing command');
  return fail(`Unknown command "${command}"`);
}
