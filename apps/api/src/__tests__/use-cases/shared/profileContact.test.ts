import { describe, expect, it } from 'vitest';
import { PROFILE_CONTACT } from '#src/use-cases/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import {
  readPhone,
  readProfileLinks,
  validateLocation,
  validatePhone,
  validateProfileLinks,
} from '#src/use-cases/shared/profileContact.js';

describe('validatePhone', () => {
  it.each(['+44 20 7946 0958', '(415) 555-0134', '415.555.0134'])('accepts %s', (phone) => {
    expect(validatePhone(phone)).toBe(phone);
  });

  it('trims, and treats blank or null as cleared', () => {
    expect(validatePhone('  555 0100 ')).toBe('555 0100');
    expect(validatePhone('   ')).toBeNull();
    expect(validatePhone(null)).toBeNull();
  });

  it('rejects letters and an over-long number', () => {
    expect(() => validatePhone('call me')).toThrow(ValidationError);
    expect(() => validatePhone('1'.repeat(PROFILE_CONTACT.PHONE_MAX_CHARS + 1))).toThrow(
      /at most 30 characters/,
    );
  });
});

describe('validateLocation', () => {
  it('trims, clears blanks and rejects an over-long value', () => {
    expect(validateLocation(' London ')).toBe('London');
    expect(validateLocation('')).toBeNull();
    expect(() => validateLocation('x'.repeat(PROFILE_CONTACT.LOCATION_MAX_CHARS + 1))).toThrow(
      ValidationError,
    );
  });
});

describe('validateProfileLinks', () => {
  it('keeps http and https links, trimmed and de-duplicated', () => {
    expect(
      validateProfileLinks([' https://linkedin.com/in/ada ', 'https://linkedin.com/in/ada', '']),
    ).toEqual(['https://linkedin.com/in/ada']);
  });

  it('treats an empty list as cleared', () => {
    expect(validateProfileLinks([])).toBeNull();
    expect(validateProfileLinks(null)).toBeNull();
  });

  it.each([
    'linkedin.com/in/ada',
    'javascript:alert(1)',
    'ftp://x.example',
    'https://u:p@x.example',
  ])('rejects %s', (link) => {
    expect(() => validateProfileLinks([link])).toThrow(ValidationError);
  });

  it('rejects too many links and an over-long link', () => {
    const many = Array.from(
      { length: PROFILE_CONTACT.MAX_LINKS + 1 },
      (_, i) => `https://a${i}.dev`,
    );
    expect(() => validateProfileLinks(many)).toThrow(/at most 3/);
    expect(() =>
      validateProfileLinks([`https://a.dev/${'x'.repeat(PROFILE_CONTACT.LINK_MAX_CHARS)}`]),
    ).toThrow(/at most 200/);
  });
});

describe('read helpers (text from a CV)', () => {
  it('drop instead of throwing', () => {
    expect(readPhone('call me')).toBeNull();
    expect(readProfileLinks(['nope', 'https://a.dev'])).toEqual(['https://a.dev']);
  });

  it('cap the links at the maximum', () => {
    const many = Array.from({ length: 6 }, (_, i) => `https://a${i}.dev`);
    expect(readProfileLinks(many)).toHaveLength(PROFILE_CONTACT.MAX_LINKS);
  });
});
