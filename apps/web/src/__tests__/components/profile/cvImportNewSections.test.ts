import { describe, it, expect } from 'vitest';
import type { ParsedCvProfile } from '#/lib/cvImport';
import {
  countSelected,
  hasInvalidSelection,
  isAwardValid,
  isCertificationValid,
  isEmpty,
  isLanguageValid,
  isProjectValid,
  toDrafts,
  toImportInput,
} from '#/routes/_authenticated/profile/-components/cvImportDrafts';

const base: ParsedCvProfile = {
  workExperiences: [],
  educations: [],
  skills: [],
  truncated: false,
};

const withSections: ParsedCvProfile = {
  ...base,
  certifications: [
    {
      name: 'CKA',
      issuer: 'CNCF',
      issuedAt: '2023-05',
      expiresAt: null,
      credentialUrl: 'https://example.com/cka',
      alreadyInProfile: false,
    },
  ],
  languages: [
    { name: 'French', proficiency: 'Fluent', alreadyInProfile: false },
    { name: 'English', proficiency: null, alreadyInProfile: true },
  ],
  projects: [
    {
      name: 'CLI',
      role: null,
      url: null,
      startDate: '2021-03',
      endDate: null,
      description: 'Built it.',
      alreadyInProfile: false,
    },
  ],
  awards: [
    {
      title: 'Dean’s List',
      issuer: null,
      date: '2018-05',
      description: null,
      alreadyInProfile: false,
    },
  ],
};

describe('CV import drafts for certifications, languages, projects and awards (JEF-592)', () => {
  it('turns each section into ticked rows, unticking what the profile already holds', () => {
    const drafts = toDrafts(withSections);

    expect(drafts.certifications[0]).toMatchObject({
      id: 'certification-0',
      selected: true,
      value: { name: 'CKA', issuer: 'CNCF', issuedAt: '2023-05', expiresAt: '' },
    });
    expect(drafts.languages.map((d) => d.selected)).toEqual([true, false]);
    expect(drafts.projects[0]!.value).toMatchObject({ startDate: '2021-03', endDate: '' });
    expect(drafts.awards[0]!.value).toMatchObject({ title: 'Dean’s List', date: '2018-05' });
  });

  it('reads an API that does not send the sections as empty lists', () => {
    const drafts = toDrafts(base);

    expect(drafts).toMatchObject({ certifications: [], languages: [], projects: [], awards: [] });
    expect(isEmpty(drafts)).toBe(true);
  });

  it('is not empty when a CV has only the new sections, and counts their ticked rows', () => {
    const drafts = toDrafts(withSections);

    expect(isEmpty(drafts)).toBe(false);
    expect(countSelected(drafts)).toBe(4);
  });

  it('sends only the ticked rows, trimmed, and leaves a section out when nothing in it is ticked', () => {
    const drafts = toDrafts(withSections);
    const input = toImportInput({ ...drafts, awards: [] });

    expect(input.certifications).toEqual([
      {
        name: 'CKA',
        issuer: 'CNCF',
        issuedAt: '2023-05',
        expiresAt: undefined,
        credentialUrl: 'https://example.com/cka',
      },
    ]);
    expect(input.languages).toEqual([{ name: 'French', proficiency: 'Fluent' }]);
    expect(input.projects).toEqual([
      {
        name: 'CLI',
        role: undefined,
        url: undefined,
        startDate: '2021-03',
        endDate: undefined,
        description: 'Built it.',
      },
    ]);
    expect(input).not.toHaveProperty('awards');
  });

  it('sends none of the new keys for a CV without them, as before', () => {
    const input = toImportInput(toDrafts(base));

    expect(Object.keys(input).sort()).toEqual(
      ['contact', 'educations', 'skills', 'workExperiences'].sort(),
    );
  });

  describe('validity', () => {
    it('needs a name, and allows blank dates', () => {
      expect(
        isCertificationValid({
          name: 'CKA',
          issuer: '',
          issuedAt: '',
          expiresAt: '',
          credentialUrl: '',
        }),
      ).toBe(true);
      expect(
        isCertificationValid({
          name: ' ',
          issuer: '',
          issuedAt: '',
          expiresAt: '',
          credentialUrl: '',
        }),
      ).toBe(false);
      expect(isLanguageValid({ name: '', proficiency: '' })).toBe(false);
      expect(isAwardValid({ title: 'A', issuer: '', date: '', description: '' })).toBe(true);
    });

    it('refuses a date that is not a month, and an end before the start', () => {
      const project = { name: 'P', role: '', url: '', description: '' };
      expect(isProjectValid({ ...project, startDate: '2021-13', endDate: '' })).toBe(false);
      expect(isProjectValid({ ...project, startDate: '2022-01', endDate: '2021-01' })).toBe(false);
      expect(isProjectValid({ ...project, startDate: '', endDate: '2021-01' })).toBe(true);
      expect(isAwardValid({ title: 'A', issuer: '', date: 'soon', description: '' })).toBe(false);
      expect(
        isCertificationValid({
          name: 'C',
          issuer: '',
          issuedAt: '2023-05',
          expiresAt: '2022-01',
          credentialUrl: '',
        }),
      ).toBe(false);
    });

    it('blocks Import only while a ticked row of a new section is invalid', () => {
      const drafts = toDrafts(withSections);
      const broken = {
        ...drafts,
        languages: drafts.languages.map((d) => ({ ...d, value: { ...d.value, name: '' } })),
      };

      expect(hasInvalidSelection(drafts)).toBe(false);
      expect(hasInvalidSelection(broken)).toBe(true);
      expect(
        hasInvalidSelection({
          ...broken,
          languages: broken.languages.map((d) => ({ ...d, selected: false })),
        }),
      ).toBe(false);
    });
  });
});
