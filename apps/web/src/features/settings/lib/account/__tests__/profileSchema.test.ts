import { describe, expect, it } from 'vitest';
import {
  MAX_PROFILE_LINKS,
  parseProfileLinks,
  profileSchema,
} from '#/features/settings/lib/account/profileSchema';

const valid = {
  name: 'Ada',
  timezone: 'UTC',
  targetRole: 'Engineer',
  phone: '',
  location: 'London',
  profileLinks: '',
};

function messages(overrides: Partial<typeof valid>) {
  const result = profileSchema.safeParse({ ...valid, ...overrides });
  return result.success ? [] : result.error.issues.map((i) => [i.path.join('.'), i.message]);
}

describe('parseProfileLinks', () => {
  it('splits on LF and CRLF, trims and drops blank lines', () => {
    expect(parseProfileLinks(' https://a.com \r\n\r\n\nhttps://b.com\n  ')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseProfileLinks('')).toEqual([]);
    expect(parseProfileLinks('  \n  ')).toEqual([]);
  });
});

describe('profileSchema', () => {
  it('accepts a profile with everything optional left blank', () => {
    expect(messages({})).toEqual([]);
  });

  it.each([
    ['name', 'Name is too long'],
    ['targetRole', 'Target role is too long'],
    ['location', 'Location is too long'],
  ] as const)('limits %s to 100 characters', (field, message) => {
    expect(messages({ [field]: 'a'.repeat(100) })).toEqual([]);
    expect(messages({ [field]: 'a'.repeat(101) })).toEqual([[field, message]]);
  });

  describe('phone', () => {
    it.each([
      '+44 20 7946 0958',
      '(555) 123-4567',
      '555.123.4567',
      '020/7946/0958',
      ' +1 555 ',
      '',
    ])('accepts %j', (phone) => {
      expect(messages({ phone })).toEqual([]);
    });

    it.each(['abc', 'call me', '+', '555-CALL', '#123'])('rejects %j', (phone) => {
      expect(messages({ phone })).toEqual([['phone', 'profile.phoneInvalid']]);
    });

    it('rejects a phone number over 30 characters', () => {
      expect(messages({ phone: '1'.repeat(31) })).toEqual([['phone', 'Phone number is too long']]);
    });
  });

  describe('profileLinks', () => {
    it('accepts up to the maximum number of http(s) links', () => {
      const links = Array.from({ length: MAX_PROFILE_LINKS }, (_, i) => `https://e.com/${i}`);
      expect(messages({ profileLinks: links.join('\n') })).toEqual([]);
      expect(messages({ profileLinks: 'HTTP://example.com' })).toEqual([]);
    });

    it('rejects more than the maximum', () => {
      const links = Array.from({ length: MAX_PROFILE_LINKS + 1 }, (_, i) => `https://e.com/${i}`);
      expect(messages({ profileLinks: links.join('\n') })).toEqual([
        ['profileLinks', 'profile.profileLinksTooMany'],
      ]);
    });

    it.each(['example.com', 'ftp://example.com', 'javascript:alert(1)', 'https://', 'https://a b'])(
      'rejects the invalid link %j',
      (profileLinks) => {
        expect(messages({ profileLinks })).toEqual([
          ['profileLinks', 'profile.profileLinkInvalid'],
        ]);
      },
    );

    it('rejects a link over 200 characters', () => {
      const long = `https://example.com/${'a'.repeat(200)}`;
      expect(messages({ profileLinks: long })).toEqual([
        ['profileLinks', 'profile.profileLinkInvalid'],
      ]);
    });

    it('reports too many before invalid', () => {
      const links = Array.from({ length: MAX_PROFILE_LINKS + 1 }, () => 'nope').join('\n');
      expect(messages({ profileLinks: links })).toEqual([
        ['profileLinks', 'profile.profileLinksTooMany'],
      ]);
    });
  });
});
