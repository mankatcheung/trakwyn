import { describe, expect, it } from 'vitest';
import { parsePlanCommand, PLAN_USAGE } from '#src/infrastructure/cli/parsePlanCommand.js';

describe('parsePlanCommand', () => {
  describe('set', () => {
    it('reads an email and a plan', () => {
      expect(parsePlanCommand(['set', '--email', 'a@b.com', '--plan', 'pro'])).toEqual({
        kind: 'set',
        email: 'a@b.com',
        plan: 'pro',
        days: undefined,
      });
    });

    it('reads a number of days', () => {
      expect(
        parsePlanCommand(['set', '--email', 'a@b.com', '--plan', 'pro', '--days', '30']),
      ).toEqual({ kind: 'set', email: 'a@b.com', plan: 'pro', days: 30 });
    });

    it('accepts free', () => {
      expect(parsePlanCommand(['set', '--email', 'a@b.com', '--plan', 'free'])).toMatchObject({
        plan: 'free',
      });
    });

    it('needs an email', () => {
      expect(() => parsePlanCommand(['set', '--plan', 'pro'])).toThrow(/--email/);
    });

    it('needs a plan', () => {
      expect(() => parsePlanCommand(['set', '--email', 'a@b.com'])).toThrow(/--plan/);
    });

    it('refuses a plan that does not exist', () => {
      expect(() => parsePlanCommand(['set', '--email', 'a@b.com', '--plan', 'gold'])).toThrow(
        /free or pro/,
      );
    });

    it.each(['abc', '1.5', '0', '-3', ''])('refuses %j as a number of days', (days) => {
      expect(() =>
        parsePlanCommand(['set', '--email', 'a@b.com', '--plan', 'pro', '--days', days]),
      ).toThrow(/--days/);
    });
  });

  describe('grant-trial', () => {
    it('needs nothing', () => {
      expect(parsePlanCommand(['grant-trial'])).toEqual({
        kind: 'grant-trial',
        days: undefined,
        dryRun: false,
      });
    });

    it('reads days and a dry run', () => {
      expect(parsePlanCommand(['grant-trial', '--days', '14', '--dry-run'])).toEqual({
        kind: 'grant-trial',
        days: 14,
        dryRun: true,
      });
    });
  });

  it('prints the usage when there is no command', () => {
    expect(() => parsePlanCommand([])).toThrow(PLAN_USAGE);
  });

  it('prints the usage for a command it does not know', () => {
    expect(() => parsePlanCommand(['delete'])).toThrow(/Unknown command "delete"/);
  });

  it('refuses a flag it does not know rather than ignoring it', () => {
    expect(() => parsePlanCommand(['grant-trial', '--dryrun'])).toThrow();
  });
});
