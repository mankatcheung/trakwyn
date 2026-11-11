import { describe, expect, it } from 'vitest';
import { formatProfileMonth, formatUserProfile } from '#src/use-cases/shared/userProfile.js';
import type { UserProfile } from '#src/use-cases/shared/userProfile.js';

describe('formatProfileMonth', () => {
  it('writes a short month and year', () => {
    expect(formatProfileMonth(new Date('2021-03-15T12:00:00Z'))).toBe('Mar 2021');
  });

  it('keeps midnight UTC on the 1st in its month, whatever the process timezone', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
        process.env.TZ = tz;
        expect(formatProfileMonth(new Date('2021-03-01T00:00:00Z'))).toBe('Mar 2021');
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('formatUserProfile dates', () => {
  const profile = {
    workExperiences: [
      {
        title: 'Engineer',
        company: 'Lumen Freight',
        startDate: new Date('2021-03-01T00:00:00Z'),
        endDate: null,
        description: null,
      },
      {
        title: 'Intern',
        company: 'Acme',
        startDate: new Date('2020-01-01T00:00:00Z'),
        endDate: new Date('2021-02-28T00:00:00Z'),
        description: null,
      },
    ],
    educations: [
      {
        degree: 'BSc',
        field: 'CS',
        institution: 'State U',
        startDate: new Date('2016-09-01T00:00:00Z'),
        endDate: new Date('2020-06-01T00:00:00Z'),
        description: null,
      },
    ],
    skills: [],
  } as unknown as UserProfile;

  it('uses month and year, and Present for an open end', () => {
    const out = formatUserProfile(profile);
    expect(out).toContain('Engineer at Lumen Freight (Mar 2021 – Present)');
    expect(out).toContain('Intern at Acme (Jan 2020 – Feb 2021)');
    expect(out).toContain('BSc CS at State U (Sep 2016 – Jun 2020)');
    expect(out).not.toMatch(/\d+\/\d+\/\d+/);
  });
});
