import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '#src/domain/user/normalizeEmail.js';

describe('normalizeEmail (JEF-692)', () => {
  it('lowercases the whole address', () => {
    expect(normalizeEmail('Jeff.Man@Example.COM')).toBe('jeff.man@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  a@b.com\t\n')).toBe('a@b.com');
  });

  it('is idempotent', () => {
    const once = normalizeEmail(' Foo@Bar.com ');
    expect(normalizeEmail(once)).toBe(once);
  });

  it('keeps plus tags and dots, which are provider rules and not ours to strip', () => {
    expect(normalizeEmail('A.B+Tag@Gmail.com')).toBe('a.b+tag@gmail.com');
  });

  it('lowercases non-ASCII letters', () => {
    expect(normalizeEmail('ÉLISE@EXAMPLE.COM')).toBe('élise@example.com');
  });

  it('leaves a blank string empty', () => {
    expect(normalizeEmail('   ')).toBe('');
  });
});
