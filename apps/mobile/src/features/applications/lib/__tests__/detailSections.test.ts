import { DETAIL_SECTION_GROUPS } from '../detailSections';

describe('detail sections (JEF-396)', () => {
  const documentGroup = DETAIL_SECTION_GROUPS.find((g) => g.titleKey === 'detail.groupDocuments')!;
  const slugs = documentGroup.sections.map((s) => s.slug);

  it('lists the three document sections and no combined Documents section', () => {
    expect(slugs).toEqual(expect.arrayContaining(['cover-letters', 'resumes', 'other-documents']));
    expect(slugs).not.toContain('documents');
    expect(slugs).not.toContain('cover-letter');
  });

  it('gives every section a unique key and slug', () => {
    const all = DETAIL_SECTION_GROUPS.flatMap((g) => g.sections);
    expect(new Set(all.map((s) => s.key)).size).toBe(all.length);
    expect(new Set(all.map((s) => s.slug)).size).toBe(all.length);
  });
});
