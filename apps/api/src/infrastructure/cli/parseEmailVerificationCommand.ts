import { parseArgs } from 'node:util';

export const EMAIL_VERIFICATION_USAGE = [
  'Usage:',
  '  pnpm --filter @trakwyn/api email-verification backfill --before <date> [--dry-run]',
  '',
  '  <date> is YYYY-MM-DD or a full ISO timestamp, read as UTC.',
].join('\n');

export interface EmailVerificationCommand {
  kind: 'backfill';
  before: Date;
  dryRun: boolean;
}

function fail(message: string): never {
  throw new Error(`${message}\n\n${EMAIL_VERIFICATION_USAGE}`);
}

/** `YYYY-MM-DD`, optionally followed by a time. Looser strings (`2026`, `11/01/2026`) are ambiguous. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.+)?$/;

function parseBefore(raw: string): Date {
  const date = new Date(raw);
  if (!ISO_DATE.test(raw) || Number.isNaN(date.getTime())) {
    fail('--before must be a date such as 2026-11-01');
  }
  return date;
}

/**
 * Reads the operator's `email-verification` command line (JEF-438). Throws an
 * `Error` whose message is the usage text, which the entrypoint prints.
 *
 * `--before` is required: leaving it out must not be a way to verify every
 * account by accident.
 */
export function parseEmailVerificationCommand(argv: string[]): EmailVerificationCommand {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      before: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  const [command, ...extra] = positionals;
  if (extra.length > 0) fail(`Unexpected argument "${extra[0]}"`);

  if (command === 'backfill') {
    if (values.before === undefined) fail('backfill needs --before');
    return { kind: 'backfill', before: parseBefore(values.before), dryRun: values['dry-run'] };
  }

  if (command === undefined) fail('Missing command');
  return fail(`Unknown command "${command}"`);
}
