import { describe, it, expect } from 'vitest';
import {
  ALL_SECTIONS,
  LEGACY_SECTION_IDS,
  SECTION_GROUPS,
  SECTION_IDS,
  sectionSearchSchema,
  type SectionCounts,
} from '#/routes/_authenticated/applications/$applicationId/-sections';
import { documentSectionCounts } from '#/routes/_authenticated/applications/$applicationId/-sectionCounts';

describe('document sections (JEF-396)', () => {
  it('has the three document tabs and no combined Documents tab', () => {
    expect(SECTION_IDS).toEqual(
      expect.arrayContaining(['cover-letters', 'resumes', 'other-documents']),
    );
    expect(SECTION_IDS).not.toContain('documents');
    expect(SECTION_IDS).not.toContain('cover-letter');
  });

  it('orders the group Company briefing, Resumes, Cover letters, Other documents', () => {
    const group = SECTION_GROUPS.find((g) => g.titleKey === 'applicationDetail.groupDocuments')!;

    expect(group.sections.map((s) => s.id)).toEqual([
      'company-briefing',
      'resumes',
      'cover-letters',
      'other-documents',
    ]);
  });

  it('has no standalone resume-match section; a saved link lands on Resumes (JEF-397)', () => {
    expect(SECTION_IDS).not.toContain('resume-match');
    expect(sectionSearchSchema.parse({ section: 'resume-match' })).toEqual({
      section: 'resumes',
    });
  });

  it('keeps old ?section= links working', () => {
    expect(sectionSearchSchema.parse({ section: 'documents' })).toEqual({ section: 'resumes' });
    expect(sectionSearchSchema.parse({ section: 'cover-letter' })).toEqual({
      section: 'cover-letters',
    });
    for (const target of Object.values(LEGACY_SECTION_IDS)) {
      expect(SECTION_IDS).toContain(target);
    }
  });

  it('still accepts current ids and an absent section', () => {
    expect(sectionSearchSchema.parse({ section: 'other-documents' })).toEqual({
      section: 'other-documents',
    });
    expect(sectionSearchSchema.parse({})).toEqual({});
  });

  it('rejects ids that never existed, and does not treat prototype keys as legacy', () => {
    expect(sectionSearchSchema.safeParse({ section: 'nope' }).success).toBe(false);
    expect(sectionSearchSchema.safeParse({ section: 'constructor' }).success).toBe(false);
  });

  it('leads with a wide-only Overview section that links straight to it (JEF-403)', () => {
    expect(ALL_SECTIONS[0]).toMatchObject({ id: 'overview', wideOnly: true });
    expect(ALL_SECTIONS.filter((s) => s.wideOnly).map((s) => s.id)).toEqual(['overview']);
    expect(sectionSearchSchema.parse({ section: 'overview' })).toEqual({ section: 'overview' });
  });

  it('reads each tab badge from its own count', () => {
    const counts: SectionCounts = {
      notes: 0,
      interviews: 0,
      contacts: 0,
      offers: 0,
      companyBriefing: false,
      coverLetters: 1,
      resumes: 2,
      otherDocuments: 3,
    };
    const countOf = (id: string) => ALL_SECTIONS.find((s) => s.id === id)!.countOf!(counts);
    expect([countOf('cover-letters'), countOf('resumes'), countOf('other-documents')]).toEqual([
      1, 2, 3,
    ]);
  });

  it('flags only Company Briefing as generated-or-not, not counted', () => {
    const counts: SectionCounts = {
      notes: 0,
      interviews: 0,
      contacts: 0,
      offers: 0,
      companyBriefing: true,
      coverLetters: 0,
      resumes: 0,
      otherDocuments: 0,
    };
    const flagged = ALL_SECTIONS.filter((s) => s.generatedOf);
    expect(flagged.map((s) => s.id)).toEqual(['company-briefing']);
    expect(flagged[0].generatedOf!(counts)).toBe(true);
    expect(flagged[0].generatedOf!({ ...counts, companyBriefing: false })).toBe(false);
    expect(flagged[0].countOf).toBeUndefined();
  });
});

describe('documentSectionCounts', () => {
  it('counts drafts and uploads together, each in exactly one category', () => {
    const counts = documentSectionCounts(
      [
        { documentType: 'resume' },
        { documentType: 'cover_letter' },
        { documentType: 'portfolio' },
        { documentType: 'other' },
        { documentType: 'unknown' },
      ],
      [{ type: 'resume' }, { type: 'resume' }, { type: 'cover_letter' }],
    );

    expect(counts).toEqual({ coverLetters: 2, resumes: 3, otherDocuments: 3 });
    expect(counts.coverLetters + counts.resumes + counts.otherDocuments).toBe(8);
  });

  it('is all zero for an application with nothing', () => {
    expect(documentSectionCounts([], [])).toEqual({
      coverLetters: 0,
      resumes: 0,
      otherDocuments: 0,
    });
  });
});
