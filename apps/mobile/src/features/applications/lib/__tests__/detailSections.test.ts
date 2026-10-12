import { DETAIL_SECTION_GROUPS } from '../detailSections';

describe('detail sections (JEF-396)', () => {
  const documentGroup = DETAIL_SECTION_GROUPS.find((g) => g.titleKey === 'detail.groupDocuments')!;
  const slugs = documentGroup.sections.map((s) => s.slug);

  it('lists the three document sections and no combined Documents section', () => {
    expect(slugs).toEqual(expect.arrayContaining(['cover-letters', 'resumes', 'other-documents']));
    expect(slugs).not.toContain('documents');
    expect(slugs).not.toContain('cover-letter');
  });

  it('orders the group Company briefing, Resumes, Cover letters, Other documents, Resume match', () => {
    expect(slugs).toEqual([
      'company-briefing',
      'resumes',
      'cover-letters',
      'other-documents',
      'resume-match',
    ]);
  });

  it('gives every section a unique key and slug', () => {
    const all = DETAIL_SECTION_GROUPS.flatMap((g) => g.sections);
    expect(new Set(all.map((s) => s.key)).size).toBe(all.length);
    expect(new Set(all.map((s) => s.slug)).size).toBe(all.length);
  });
});

describe('detail section badges', () => {
  const all = DETAIL_SECTION_GROUPS.flatMap((g) => g.sections);
  const byKey = (key: string) => all.find((s) => s.key === key)!;
  const counts = {
    notes: 1,
    interviews: 2,
    contacts: 3,
    offers: 4,
    companyBriefing: true,
    coverLetters: 5,
    resumes: 6,
    otherDocuments: 7,
  };

  it('reads each counted section from its own count', () => {
    const keys = [
      'notes',
      'interviews',
      'contacts',
      'offers',
      'coverLetters',
      'resumes',
      'otherDocuments',
    ];
    expect(keys.map((key) => byKey(key).countOf!(counts))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('flags Company briefing as generated-or-not rather than counting it', () => {
    expect(byKey('companyBriefing').countOf).toBeUndefined();
    expect(byKey('companyBriefing').generatedOf!(counts)).toBe(true);
    expect(byKey('companyBriefing').generatedOf!({ ...counts, companyBriefing: false })).toBe(
      false,
    );
  });

  it('leaves Activity and Resume match unmarked', () => {
    for (const key of ['activity', 'resumeMatch']) {
      expect(byKey(key).countOf).toBeUndefined();
      expect(byKey(key).generatedOf).toBeUndefined();
    }
  });
});
