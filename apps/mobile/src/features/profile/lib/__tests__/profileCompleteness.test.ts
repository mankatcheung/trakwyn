import {
  MIN_SKILLS_FOR_COMPLETE_PROFILE,
  latestRole,
  profileCompleteness,
} from '../profileCompleteness';

interface TestRole {
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  description: string | null;
}

const role = (over: Partial<TestRole> = {}): TestRole => ({
  title: 'Engineer',
  company: 'Acme',
  startDate: '2020-01-01',
  endDate: null,
  description: null,
  ...over,
});

const skills = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }));

describe('profileCompleteness', () => {
  it('is 0% and points at the first check for an empty profile', () => {
    const result = profileCompleteness({ workExperiences: [], educations: [], skills: [] });
    expect(result.percent).toBe(0);
    expect(result.nextStep).toBe('role');
  });

  it('asks for a role description once there is a role without one', () => {
    const result = profileCompleteness({
      workExperiences: [role({ description: '   ' })],
      educations: [],
      skills: [],
    });
    expect(result.passed).toMatchObject({ role: true, roleDescription: false });
    expect(result.percent).toBe(25);
    expect(result.nextStep).toBe('roleDescription');
  });

  it('needs the minimum number of skills, not just one', () => {
    const below = profileCompleteness({
      workExperiences: [role({ description: 'Built things' })],
      educations: [{ id: 'e1' }],
      skills: skills(MIN_SKILLS_FOR_COMPLETE_PROFILE - 1),
    });
    expect(below.passed.skills).toBe(false);
    expect(below.percent).toBe(75);
    expect(below.nextStep).toBe('skills');
  });

  it('is 100% with no next step when every check passes', () => {
    const result = profileCompleteness({
      workExperiences: [role({ description: 'Built things' })],
      educations: [{ id: 'e1' }],
      skills: skills(MIN_SKILLS_FOR_COMPLETE_PROFILE),
    });
    expect(result.percent).toBe(100);
    expect(result.nextStep).toBeNull();
  });
});

describe('latestRole', () => {
  it('returns null when there are no roles', () => {
    expect(latestRole([])).toBeNull();
  });

  it('prefers a role still held over any that ended', () => {
    const held = role({ title: 'Current', startDate: '2019-01-01', endDate: null });
    const ended = role({ title: 'Past', startDate: '2022-01-01', endDate: '2023-01-01' });
    expect(latestRole([ended, held])?.title).toBe('Current');
  });

  it('otherwise picks the role that ended most recently', () => {
    const older = role({ title: 'Older', endDate: '2020-06-30' });
    const newer = role({ title: 'Newer', endDate: '2024-06-30' });
    expect(latestRole([older, newer])?.title).toBe('Newer');
  });

  it('breaks an end-date tie with the later start date', () => {
    const a = role({ title: 'A', startDate: '2018-01-01', endDate: '2022-01-01' });
    const b = role({ title: 'B', startDate: '2020-01-01', endDate: '2022-01-01' });
    expect(latestRole([a, b])?.title).toBe('B');
  });

  it('does not reorder the array it is given', () => {
    const roles = [
      role({ title: 'A', endDate: '2020-01-01' }),
      role({ title: 'B', endDate: '2024-01-01' }),
    ];
    latestRole(roles);
    expect(roles.map((r) => r.title)).toEqual(['A', 'B']);
  });
});
