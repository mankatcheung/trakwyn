import { describe, it, expect } from 'vitest';
import type { ParsedCvProfile } from '#/lib/cvImport';
import {
  countSelected,
  hasInvalidSelection,
  isEducationValid,
  isEmpty,
  isSkillValid,
  isWorkValid,
  setAllSelected,
  toDrafts,
  toImportInput,
  updateDraft,
  type EducationValue,
  type SkillValue,
  type WorkValue,
} from '#/routes/_authenticated/profile/-components/cvImportDrafts';

const parsed = (overrides: Partial<ParsedCvProfile> = {}): ParsedCvProfile => ({
  workExperiences: [
    {
      company: 'Acme',
      title: 'Engineer',
      location: 'Remote',
      startDate: '2020-03',
      endDate: null,
      description: 'Built things.',
      alreadyInProfile: false,
    },
    {
      company: 'Globex',
      title: 'Dev',
      location: null,
      startDate: '2018-01',
      endDate: '2020-02',
      description: null,
      alreadyInProfile: true,
    },
  ],
  educations: [
    {
      institution: 'UC Berkeley',
      degree: 'B.S.',
      field: null,
      startDate: '2012-01',
      endDate: '2016-01',
      description: null,
      alreadyInProfile: false,
    },
  ],
  skills: [
    { name: 'TypeScript', category: 'Language', proficiency: 'expert', alreadyInProfile: false },
    { name: 'Go', category: null, proficiency: null, alreadyInProfile: true },
  ],
  truncated: false,
  ...overrides,
});

const work = (overrides: Partial<WorkValue> = {}): WorkValue => ({
  company: 'Acme',
  title: 'Engineer',
  location: '',
  startDate: '2020-03',
  endDate: '',
  description: '',
  ...overrides,
});

const education = (overrides: Partial<EducationValue> = {}): EducationValue => ({
  institution: 'UC Berkeley',
  degree: '',
  field: '',
  startDate: '2012-01',
  endDate: '',
  description: '',
  ...overrides,
});

const skill = (overrides: Partial<SkillValue> = {}): SkillValue => ({
  name: 'Go',
  category: '',
  proficiency: '',
  ...overrides,
});

describe('toDrafts', () => {
  it('turns every entry into a row, in order, with a stable id', () => {
    const drafts = toDrafts(parsed());
    expect(drafts.workExperiences.map((d) => d.id)).toEqual(['work-0', 'work-1']);
    expect(drafts.educations.map((d) => d.id)).toEqual(['education-0']);
    expect(drafts.skills.map((d) => d.id)).toEqual(['skill-0', 'skill-1']);
  });

  it('ticks what is new and unticks what the profile already holds', () => {
    const drafts = toDrafts(parsed());
    expect(drafts.workExperiences.map((d) => d.selected)).toEqual([true, false]);
    expect(drafts.skills.map((d) => d.selected)).toEqual([true, false]);
    expect(drafts.workExperiences[1]!.alreadyInProfile).toBe(true);
  });

  it('holds a missing value as an empty string, which is what an input holds', () => {
    const { workExperiences } = toDrafts(parsed());
    expect(workExperiences[1]!.value).toEqual({
      company: 'Globex',
      title: 'Dev',
      location: '',
      startDate: '2018-01',
      endDate: '2020-02',
      description: '',
    });
    expect(workExperiences[0]!.value.endDate).toBe('');
  });
});

describe('isEmpty', () => {
  it('is true only when nothing was read', () => {
    expect(isEmpty(toDrafts(parsed({ workExperiences: [], educations: [], skills: [] })))).toBe(
      true,
    );
    expect(isEmpty(toDrafts(parsed({ workExperiences: [], educations: [] })))).toBe(false);
  });
});

describe('validity', () => {
  it('accepts a complete work experience, with or without an end', () => {
    expect(isWorkValid(work())).toBe(true);
    expect(isWorkValid(work({ endDate: '2021-06' }))).toBe(true);
    expect(isWorkValid(work({ endDate: '2020-03' }))).toBe(true);
  });

  it.each([
    ['a blank company', { company: '  ' }],
    ['a blank title', { title: '' }],
    ['no start', { startDate: '' }],
    ['a start that is not a month', { startDate: '2020' }],
    ['a month 13', { startDate: '2020-13' }],
    ['an end that is not a month', { endDate: 'soon' }],
    ['an end before the start', { endDate: '2019-12' }],
  ])('refuses a work experience with %s', (_name, change) => {
    expect(isWorkValid(work(change))).toBe(false);
  });

  it('judges education and skills by their required fields', () => {
    expect(isEducationValid(education())).toBe(true);
    expect(isEducationValid(education({ institution: ' ' }))).toBe(false);
    expect(isEducationValid(education({ startDate: '' }))).toBe(false);
    expect(isEducationValid(education({ endDate: '2011-01' }))).toBe(false);
    expect(isSkillValid(skill())).toBe(true);
    expect(isSkillValid(skill({ name: '   ' }))).toBe(false);
  });
});

describe('selection', () => {
  it('counts the ticked rows across the three sections', () => {
    expect(countSelected(toDrafts(parsed()))).toBe(3);
  });

  it('counts none when everything is already in the profile', () => {
    const allKnown = parsed();
    for (const list of [allKnown.workExperiences, allKnown.educations, allKnown.skills]) {
      for (const entry of list) entry.alreadyInProfile = true;
    }
    expect(countSelected(toDrafts(allKnown))).toBe(0);
  });

  it('ticks or unticks a whole section at once', () => {
    const { workExperiences } = toDrafts(parsed());
    expect(setAllSelected(workExperiences, true).every((d) => d.selected)).toBe(true);
    expect(setAllSelected(workExperiences, false).some((d) => d.selected)).toBe(false);
  });

  it('flags a ticked row that has been edited into something invalid', () => {
    const drafts = toDrafts(parsed());
    const broken = {
      ...drafts,
      workExperiences: updateDraft(drafts.workExperiences, 'work-0', (d) => ({
        ...d,
        value: { ...d.value, company: '' },
      })),
    };
    expect(hasInvalidSelection(drafts)).toBe(false);
    expect(hasInvalidSelection(broken)).toBe(true);
  });

  it('ignores an invalid row once it is unticked', () => {
    const drafts = toDrafts(parsed());
    const broken = {
      ...drafts,
      skills: updateDraft(drafts.skills, 'skill-0', (d) => ({
        ...d,
        selected: false,
        value: { ...d.value, name: '' },
      })),
    };
    expect(hasInvalidSelection(broken)).toBe(false);
  });
});

describe('updateDraft', () => {
  it('changes only the named row and leaves the list it was given alone', () => {
    const { skills } = toDrafts(parsed());
    const before = structuredClone(skills);

    const next = updateDraft(skills, 'skill-0', (d) => ({ ...d, selected: false }));

    expect(next.map((d) => d.selected)).toEqual([false, false]);
    expect(next[1]).toBe(skills[1]);
    expect(skills).toEqual(before);
  });
});

describe('toImportInput', () => {
  it('sends only the ticked rows', () => {
    const input = toImportInput(toDrafts(parsed()));
    expect(input.workExperiences.map((e) => e.company)).toEqual(['Acme']);
    expect(input.educations).toHaveLength(1);
    expect(input.skills.map((s) => s.name)).toEqual(['TypeScript']);
  });

  it('sends what the user edited', () => {
    const drafts = toDrafts(parsed());
    const edited = {
      ...drafts,
      workExperiences: updateDraft(drafts.workExperiences, 'work-0', (d) => ({
        ...d,
        value: { ...d.value, title: '  Staff Engineer ' },
      })),
    };
    expect(toImportInput(edited).workExperiences[0]!.title).toBe('Staff Engineer');
  });

  it('leaves blank optional fields out rather than sending empty strings', () => {
    const drafts = toDrafts(parsed());
    expect(toImportInput(drafts).educations[0]).toEqual({
      institution: 'UC Berkeley',
      degree: 'B.S.',
      field: undefined,
      startDate: '2012-01',
      endDate: '2016-01',
      description: undefined,
    });
    expect(toImportInput(drafts).workExperiences[0]!.endDate).toBeUndefined();
  });

  it('sends the dates as months, which the API reads as the first of the month', () => {
    expect(toImportInput(toDrafts(parsed())).workExperiences[0]!.startDate).toBe('2020-03');
  });

  it('sends a row the user re-ticked even though it was already in the profile', () => {
    const drafts = toDrafts(parsed());
    const reticked = {
      ...drafts,
      skills: setAllSelected(drafts.skills, true),
    };
    expect(toImportInput(reticked).skills.map((s) => s.name)).toEqual(['TypeScript', 'Go']);
  });
});
