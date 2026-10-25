import { afterEach, describe, expect, it } from 'vitest';
import { resolveAutoVerifyEmail } from '#src/infrastructure/config/autoVerifyEmail.js';

const original = { ...process.env };

const configure = (nodeEnv: string, autoVerify?: string) => {
  process.env.NODE_ENV = nodeEnv;
  if (autoVerify === undefined) delete process.env.AUTO_VERIFY_EMAIL;
  else process.env.AUTO_VERIFY_EMAIL = autoVerify;
};

describe('resolveAutoVerifyEmail (JEF-438)', () => {
  afterEach(() => {
    process.env = { ...original };
  });

  it('is on outside production when unset', () => {
    configure('development');
    expect(resolveAutoVerifyEmail()).toBe(true);
    configure('test');
    expect(resolveAutoVerifyEmail()).toBe(true);
  });

  it('is off in production when unset or blank', () => {
    configure('production');
    expect(resolveAutoVerifyEmail()).toBe(false);
    configure('production', '  ');
    expect(resolveAutoVerifyEmail()).toBe(false);
  });

  it('lets the variable override either default', () => {
    configure('production', 'true');
    expect(resolveAutoVerifyEmail()).toBe(true);
    configure('test', 'FALSE');
    expect(resolveAutoVerifyEmail()).toBe(false);
  });

  it('refuses a value it does not understand', () => {
    configure('production', 'yes');
    expect(() => resolveAutoVerifyEmail()).toThrow(/AUTO_VERIFY_EMAIL/);
  });
});
