import { afterEach, describe, expect, it } from 'vitest';
import { resolveEmailVerificationRequired } from '#src/infrastructure/config/emailVerificationRequired.js';

const original = { ...process.env };

const configure = (value?: string) => {
  if (value === undefined) delete process.env.EMAIL_VERIFICATION_REQUIRED;
  else process.env.EMAIL_VERIFICATION_REQUIRED = value;
};

describe('resolveEmailVerificationRequired (JEF-438 kill switch)', () => {
  afterEach(() => {
    process.env = { ...original };
  });

  it('is on when unset or blank', () => {
    configure();
    expect(resolveEmailVerificationRequired()).toBe(true);
    configure('   ');
    expect(resolveEmailVerificationRequired()).toBe(true);
  });

  it('is on when set to true', () => {
    configure('true');
    expect(resolveEmailVerificationRequired()).toBe(true);
  });

  it('is off only for false, ignoring case and spaces', () => {
    configure('false');
    expect(resolveEmailVerificationRequired()).toBe(false);
    configure(' FALSE ');
    expect(resolveEmailVerificationRequired()).toBe(false);
  });

  it.each(['0', 'off', 'no', 'disabled', 'flase'])(
    'stays on for %j: a typo must not switch the wall off, and must not throw per request',
    (value) => {
      configure(value);
      expect(resolveEmailVerificationRequired()).toBe(true);
    },
  );
});
