import { describe, expect, it } from 'vitest';
import {
  applyProfileFacts,
  assertGrounded,
  nameKey,
} from '#src/use-cases/resume/resumeGrounding.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import type { UserProfile } from '#src/use-cases/shared/userProfile.js';
import { makeEducation, makeWorkExperience } from '#src/__tests__/helpers/mocks/profile.js';

const profile = (company: string, institution: string): UserProfile => ({
  certifications: [],
  languages: [],
  projects: [],
  awards: [],
  workExperiences: [
    makeWorkExperience({ company, title: 'Engineer', startDate: new Date('2021-03-01T00:00:00Z') }),
  ],
  educations: [
    makeEducation({ institution, degree: 'BSc', startDate: new Date('2014-09-01T00:00:00Z') }),
  ],
  skills: [],
});

const resume = (company: string, institution: string): ResumeContent => ({
  summary: 'Engineer.',
  experience: [{ company, title: 'Engineer', period: '2021 – Present', bullets: ['Built'] }],
  education: [{ institution, qualification: 'BSc' }],
  skills: [],
});

describe('nameKey', () => {
  it.each([
    ['Acme, Inc.', 'ACME'],
    ['Acme Corporation', 'acme'],
    ['AT&T', 'AT and T'],
    ['Université de Montréal', 'Universite de Montreal'],
    ['The Open University', 'Open University'],
    ['  Globex   Ltd. ', 'globex'],
  ])('treats %s and %s as one name', (a, b) => {
    expect(nameKey(a)).toBe(nameKey(b));
  });

  it.each([
    ['Acme', 'Acme Labs'],
    ['Globex', 'Initech'],
    ['State University', 'State College'],
    ['Inc', 'Corp'],
  ])('keeps %s and %s apart', (a, b) => {
    expect(nameKey(a)).not.toBe(nameKey(b));
  });
});

describe('assertGrounded with tidied names', () => {
  it('accepts an employer or school the model respelled', () => {
    expect(() =>
      assertGrounded(
        resume('Acme, Inc.', 'The State University'),
        profile('Acme', 'State University'),
      ),
    ).not.toThrow();
  });

  it('names the entry that is not in the profile', () => {
    expect(() =>
      assertGrounded(resume('Google', 'State University'), profile('Acme', 'State University')),
    ).toThrow(/have not recorded \("Google"\)/);
  });

  it('still refuses a different employer that shares a word', () => {
    expect(() =>
      assertGrounded(resume('Acme Labs', 'State University'), profile('Acme', 'State University')),
    ).toThrow(/have not recorded/);
  });
});

describe('applyProfileFacts with tidied names', () => {
  it('writes back the stored spelling and period', () => {
    const grounded = applyProfileFacts(
      resume('Acme, Inc.', 'The State University'),
      profile('Acme', 'State University'),
    );
    expect(grounded.resume.experience[0]).toMatchObject({ company: 'Acme' });
    expect(grounded.resume.experience[0]?.period).toContain('2021');
    expect(grounded.resume.education[0]?.institution).toBe('State University');
  });
});
