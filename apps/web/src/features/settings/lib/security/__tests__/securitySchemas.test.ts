import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import {
  backupEmailSchema,
  emailSchema,
  passwordSchema,
  reauthSchema,
  removeBackupEmailSchema,
  totpBeginSchema,
  totpConfirmSchema,
  totpDisableSchema,
} from '#/features/settings/lib/security/securitySchemas';

function messages(schema: ZodType, input: unknown) {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => [i.path.join('.'), i.message]);
}

describe('emailSchema', () => {
  it('accepts a valid email with or without a current password', () => {
    expect(messages(emailSchema, { newEmail: 'a@b.co' })).toEqual([]);
    expect(messages(emailSchema, { currentPassword: 'x', newEmail: 'a@b.co' })).toEqual([]);
  });

  it('rejects an invalid email', () => {
    expect(messages(emailSchema, { newEmail: 'nope' })).toEqual([['newEmail', 'Invalid email']]);
  });
});

describe('backupEmailSchema', () => {
  it('accepts a valid email and rejects an invalid one', () => {
    expect(messages(backupEmailSchema, { backupEmail: 'a@b.co' })).toEqual([]);
    expect(messages(backupEmailSchema, { backupEmail: '' })).toEqual([
      ['backupEmail', 'Invalid email'],
    ]);
  });
});

describe('removeBackupEmailSchema', () => {
  it('needs no password (a step-up account has none)', () => {
    expect(messages(removeBackupEmailSchema, {})).toEqual([]);
    expect(messages(removeBackupEmailSchema, { currentPassword: 'x' })).toEqual([]);
  });
});

describe('passwordSchema', () => {
  const valid = {
    currentPassword: 'old',
    newPassword: 'longenough',
    confirmPassword: 'longenough',
  };

  it('accepts a matching new password of 8 or more characters', () => {
    expect(messages(passwordSchema, valid)).toEqual([]);
    expect(
      messages(passwordSchema, { ...valid, newPassword: '12345678', confirmPassword: '12345678' }),
    ).toEqual([]);
  });

  it('requires the current password', () => {
    expect(messages(passwordSchema, { ...valid, currentPassword: '' })).toEqual([
      ['currentPassword', 'Required'],
    ]);
  });

  it('rejects a new password under 8 characters', () => {
    expect(
      messages(passwordSchema, { ...valid, newPassword: '1234567', confirmPassword: '1234567' }),
    ).toEqual([['newPassword', 'Password must be at least 8 characters']]);
  });

  it('reports a mismatch on the confirmation field', () => {
    expect(messages(passwordSchema, { ...valid, confirmPassword: 'different1' })).toEqual([
      ['confirmPassword', 'Passwords do not match'],
    ]);
  });
});

describe.each([
  ['reauthSchema', reauthSchema],
  ['totpBeginSchema', totpBeginSchema],
  ['totpDisableSchema', totpDisableSchema],
])('%s', (_name, schema) => {
  it('requires a password', () => {
    expect(messages(schema, { password: '' })).toEqual([['password', 'Required']]);
    expect(messages(schema, { password: 'x' })).toEqual([]);
  });
});

describe('reauthSchema code', () => {
  it('takes an optional code', () => {
    expect(messages(reauthSchema, { password: 'x', code: '123456' })).toEqual([]);
  });
});

describe('totpConfirmSchema', () => {
  it('accepts exactly six characters', () => {
    expect(messages(totpConfirmSchema, { code: '123456' })).toEqual([]);
  });

  it.each(['', '12345', '1234567'])('rejects %j', (code) => {
    expect(messages(totpConfirmSchema, { code })).toEqual([['code', 'Enter the 6-digit code']]);
  });
});
