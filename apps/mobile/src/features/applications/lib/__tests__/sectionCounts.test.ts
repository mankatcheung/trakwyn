import { documentSectionCounts } from '../sectionCounts';

describe('documentSectionCounts', () => {
  it('counts uploads and drafts together, each in its own category', () => {
    const counts = documentSectionCounts(
      [
        { documentType: 'resume' },
        { documentType: 'cover_letter' },
        { documentType: 'portfolio' },
        { documentType: 'other' },
      ],
      [{ type: 'resume' }, { type: 'resume' }, { type: 'cover_letter' }],
    );

    expect(counts).toEqual({ coverLetters: 2, resumes: 3, otherDocuments: 2 });
  });

  it('puts an unrecognised type in Other rather than dropping it', () => {
    expect(documentSectionCounts([{ documentType: 'reference_letter' }], [])).toEqual({
      coverLetters: 0,
      resumes: 0,
      otherDocuments: 1,
    });
  });

  it('reports zero for every category when there is nothing', () => {
    expect(documentSectionCounts([], [])).toEqual({
      coverLetters: 0,
      resumes: 0,
      otherDocuments: 0,
    });
  });
});
