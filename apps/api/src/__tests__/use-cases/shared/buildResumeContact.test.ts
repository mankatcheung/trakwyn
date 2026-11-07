import { describe, expect, it } from 'vitest';
import { buildResumeContact } from '#src/use-cases/shared/buildResumeContact.js';
import { makeUser } from '#src/__tests__/helpers/mocks/user.js';

describe('buildResumeContact', () => {
  it('has no details when the profile has none', () => {
    expect(buildResumeContact(makeUser({ name: 'Ada', email: 'ada@example.com' }))).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      details: [],
    });
  });

  it('lists phone, location, then links, skipping blanks', () => {
    const contact = buildResumeContact(
      makeUser({
        phone: '+44 20 7946 0958',
        location: '  ',
        profileLinks: ['https://github.com/ada', 'https://ada.dev'],
      }),
    );

    expect(contact.details).toEqual([
      '+44 20 7946 0958',
      'https://github.com/ada',
      'https://ada.dev',
    ]);
  });

  it('yields an empty header for a missing user', () => {
    expect(buildResumeContact(null)).toEqual({ name: null, email: null, details: [] });
  });
});
