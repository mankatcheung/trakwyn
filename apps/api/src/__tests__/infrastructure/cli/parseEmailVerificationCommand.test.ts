import { describe, expect, it } from 'vitest';
import {
  EMAIL_VERIFICATION_USAGE,
  parseEmailVerificationCommand,
} from '#src/infrastructure/cli/parseEmailVerificationCommand.js';

describe('parseEmailVerificationCommand (JEF-438)', () => {
  it('reads backfill with a cutoff date', () => {
    expect(parseEmailVerificationCommand(['backfill', '--before', '2026-11-01'])).toEqual({
      kind: 'backfill',
      before: new Date('2026-11-01T00:00:00.000Z'),
      dryRun: false,
    });
  });

  it('reads a full timestamp and --dry-run', () => {
    expect(
      parseEmailVerificationCommand(['backfill', '--before', '2026-11-01T12:30:00Z', '--dry-run']),
    ).toEqual({
      kind: 'backfill',
      before: new Date('2026-11-01T12:30:00.000Z'),
      dryRun: true,
    });
  });

  it('requires a cutoff, so no one verifies every account by leaving it out', () => {
    expect(() => parseEmailVerificationCommand(['backfill'])).toThrow(/needs --before/);
  });

  it.each(['yesterday', '2026-13-45', '11/01/2026', '2026', ''])('rejects the date %j', (value) => {
    expect(() => parseEmailVerificationCommand(['backfill', '--before', value])).toThrow(
      /--before must be a date/,
    );
  });

  it('includes the usage text in every failure', () => {
    expect(() => parseEmailVerificationCommand(['backfill'])).toThrow(EMAIL_VERIFICATION_USAGE);
  });

  it('rejects a missing, unknown or surplus command', () => {
    expect(() => parseEmailVerificationCommand([])).toThrow(/Missing command/);
    expect(() => parseEmailVerificationCommand(['verify-all'])).toThrow(/Unknown command/);
    expect(() =>
      parseEmailVerificationCommand(['backfill', 'extra', '--before', '2026-11-01']),
    ).toThrow(/Unexpected argument/);
  });
});
