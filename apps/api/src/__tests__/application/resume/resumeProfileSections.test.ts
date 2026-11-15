import { describe, expect, it } from 'vitest';
import { applyProfileFacts, assertGrounded } from '#src/use-cases/resume/resumeGrounding.js';
import { resumeToTiptapDoc } from '#src/use-cases/shared/resumeToTiptapDoc.js';
import {
  formatUserProfile,
  isUserProfileEmpty,
  type UserProfile,
} from '#src/use-cases/shared/userProfile.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import {
  makeCertification,
  makeLanguage,
  makeWorkExperience,
} from '#src/__tests__/helpers/mocks/profile.js';

const acme = makeWorkExperience({ company: 'Acme', title: 'Engineer' });
const aws = makeCertification({
  name: 'AWS Certified Solutions Architect',
  issuer: 'Amazon Web Services',
  issuedAt: new Date('2022-03-01T00:00:00Z'),
});
const french = makeLanguage({ name: 'French', proficiency: 'Fluent' });

const profileOf = (over: Partial<UserProfile> = {}): UserProfile => ({
  workExperiences: [acme],
  educations: [],
  skills: [],
  certifications: [aws],
  languages: [french],
  ...over,
});

const resumeOf = (over: Partial<ResumeContent> = {}): ResumeContent => ({
  summary: 'Engineer.',
  experience: [{ company: 'Acme', title: 'Engineer', bullets: [] }],
  education: [],
  skills: [],
  ...over,
});

describe('certifications and languages in a generated resume (JEF-592)', () => {
  it('refuses a certification or a language the profile does not hold', () => {
    const certification = resumeOf({ certifications: [{ name: 'CISSP' }] });
    expect(() => assertGrounded(certification, profileOf())).toThrow(/have not recorded/);

    const spoken = resumeOf({ languages: [{ name: 'German' }] });
    expect(() => assertGrounded(spoken, profileOf())).toThrow(/have not recorded/);
  });

  it('accepts entries the profile holds, however they are capitalised', () => {
    const resume = resumeOf({
      certifications: [{ name: 'aws certified solutions architect' }],
      languages: [{ name: ' FRENCH ' }],
    });
    expect(() => assertGrounded(resume, profileOf())).not.toThrow();
  });

  it('takes name, issuer, date and level from the profile, not the model', () => {
    const { resume } = applyProfileFacts(
      resumeOf({
        certifications: [
          { name: 'aws certified solutions architect', issuer: 'Google', date: '2030' },
        ],
        languages: [{ name: 'french', proficiency: 'Native' }],
      }),
      profileOf(),
    );
    expect(resume.certifications).toEqual([
      {
        name: 'AWS Certified Solutions Architect',
        issuer: 'Amazon Web Services',
        date: 'Mar 2022',
      },
    ]);
    expect(resume.languages).toEqual([{ name: 'French', proficiency: 'Fluent' }]);
  });

  it('lists an entry once, and nothing when the model chose none', () => {
    const twice = applyProfileFacts(
      resumeOf({
        certifications: [
          { name: 'AWS Certified Solutions Architect' },
          { name: 'AWS Certified Solutions Architect' },
        ],
      }),
      profileOf(),
    );
    expect(twice.resume.certifications).toHaveLength(1);
    expect(applyProfileFacts(resumeOf(), profileOf()).resume.languages).toEqual([]);
  });

  it('renders both as sections after the skills', () => {
    const { plainText, contentJson } = resumeToTiptapDoc(
      resumeOf({
        skills: [{ category: 'Languages', items: ['Go'] }],
        certifications: [{ name: 'CKA', issuer: 'CNCF', date: 'May 2023' }],
        languages: [{ name: 'French', proficiency: 'Fluent' }],
      }),
    );
    expect(plainText).toContain('Certifications\nCKA — CNCF — May 2023');
    expect(plainText).toContain('Languages\nFrench (Fluent)');
    expect(plainText.indexOf('Skills')).toBeLessThan(plainText.indexOf('Certifications'));
    expect(
      JSON.parse(contentJson).content.some((n: { type: string }) => n.type === 'heading'),
    ).toBe(true);
  });

  it('leaves the sections out when there are none', () => {
    const { plainText } = resumeToTiptapDoc(resumeOf({ certifications: [], languages: [] }));
    expect(plainText).not.toContain('Certifications');
    expect(plainText).not.toContain('Languages');
  });
});

describe('the profile text with certifications and languages (JEF-592)', () => {
  it('lists them with issuer and dates', () => {
    const text = formatUserProfile(profileOf());
    expect(text).toContain(
      'Certifications:\n- AWS Certified Solutions Architect (Amazon Web Services, issued Mar 2022)',
    );
    expect(text).toContain('Languages:\n- French (Fluent)');
  });

  it('is not empty when they are all the user has entered', () => {
    const only = profileOf({ workExperiences: [] });
    expect(isUserProfileEmpty(only)).toBe(false);
    expect(
      isUserProfileEmpty(profileOf({ workExperiences: [], certifications: [], languages: [] })),
    ).toBe(true);
  });
});
