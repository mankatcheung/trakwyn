import { describe, it, expect } from 'vitest';
import {
  MIN_SKILLS_FOR_COMPLETE_PROFILE,
  profileCompleteness,
  type ProfileData,
} from '#/routes/_authenticated/profile/-components/profileCompleteness';

const skills = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s-${i}` }));

const EMPTY: ProfileData = { workExperiences: [], educations: [], skills: [] };

const COMPLETE: ProfileData = {
  workExperiences: [{ description: 'Led the payments team.' }],
  educations: [{ id: 'edu-1' }],
  skills: skills(MIN_SKILLS_FOR_COMPLETE_PROFILE),
};

describe('profileCompleteness', () => {
  it('is 0% with every check failing for an empty profile, and asks for a role first', () => {
    expect(profileCompleteness(EMPTY)).toEqual({
      percent: 0,
      passed: { role: false, roleDescription: false, education: false, skills: false },
      nextStep: 'role',
    });
  });

  it('is 100% with no next step when every check passes', () => {
    const result = profileCompleteness(COMPLETE);
    expect(result.percent).toBe(100);
    expect(result.nextStep).toBeNull();
  });

  it('counts a role but asks for a description when no role has one', () => {
    const result = profileCompleteness({
      ...EMPTY,
      workExperiences: [{ description: null }, { description: '   ' }],
    });
    expect(result.passed.role).toBe(true);
    expect(result.passed.roleDescription).toBe(false);
    expect(result.percent).toBe(25);
    expect(result.nextStep).toBe('roleDescription');
  });

  it('passes the description check when any one role has a description', () => {
    const result = profileCompleteness({
      ...COMPLETE,
      workExperiences: [{ description: null }, { description: 'Shipped the mobile app.' }],
    });
    expect(result.passed.roleDescription).toBe(true);
  });

  it('asks for education once the work checks pass', () => {
    const result = profileCompleteness({ ...COMPLETE, educations: [] });
    expect(result.percent).toBe(75);
    expect(result.nextStep).toBe('education');
  });

  it(`needs at least ${MIN_SKILLS_FOR_COMPLETE_PROFILE} skills`, () => {
    const short = profileCompleteness({
      ...COMPLETE,
      skills: skills(MIN_SKILLS_FOR_COMPLETE_PROFILE - 1),
    });
    expect(short.passed.skills).toBe(false);
    expect(short.nextStep).toBe('skills');
    expect(short.percent).toBe(75);
  });

  it('picks the earliest failing check as the next step, whatever else is missing', () => {
    const result = profileCompleteness({ ...EMPTY, skills: skills(10) });
    expect(result.percent).toBe(25);
    expect(result.nextStep).toBe('role');
  });
});
