import { describe, expect, it } from 'vitest';
import { displayName, hasDistinctName, initials } from './user';

describe('displayName', () => {
  it('uses the name when there is one', () => {
    expect(displayName({ name: 'Ada Lovelace', email: 'ada@example.com' })).toBe('Ada Lovelace');
  });

  it('falls back to the email when the name is missing or blank', () => {
    expect(displayName({ name: null, email: 'ada@example.com' })).toBe('ada@example.com');
    expect(displayName({ name: '   ', email: 'ada@example.com' })).toBe('ada@example.com');
  });
});

describe('hasDistinctName', () => {
  it('is true only when a non-blank name is set', () => {
    expect(hasDistinctName({ name: 'Ada', email: 'ada@example.com' })).toBe(true);
    expect(hasDistinctName({ name: ' ', email: 'ada@example.com' })).toBe(false);
    expect(hasDistinctName({ name: null, email: 'ada@example.com' })).toBe(false);
  });
});

describe('initials', () => {
  it('takes the first and last word of the name', () => {
    expect(initials({ name: 'ada king lovelace', email: 'a@example.com' })).toBe('AL');
  });

  it('takes one letter from a single-word name', () => {
    expect(initials({ name: 'Ada', email: 'a@example.com' })).toBe('A');
  });

  it('falls back to the first letter of the email', () => {
    expect(initials({ name: null, email: 'zed@example.com' })).toBe('Z');
    expect(initials({ name: '  ', email: 'zed@example.com' })).toBe('Z');
  });
});
