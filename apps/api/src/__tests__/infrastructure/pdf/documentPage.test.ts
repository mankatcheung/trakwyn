import { describe, expect, it } from 'vitest';
import { DOCUMENT_PAGE } from '#src/infrastructure/pdf/documentPage.js';

/*
 * The web editor draws a draft on a page with these numbers (JEF-581), copied
 * into `apps/web/src/lib/documentPage.ts` because the two apps share no code.
 * The web side has the same literal in its own test. Change one and both tests
 * fail until the other side matches, so the editor cannot drift from the PDF.
 */
describe('DOCUMENT_PAGE', () => {
  it('is the page the web editor draws (apps/web/src/lib/documentPage.ts)', () => {
    expect(DOCUMENT_PAGE).toEqual({
      widthPt: 595.28,
      paddingPt: 40,
      fontSizePt: 11,
      lineHeight: 1.5,
      fontFamily: 'Helvetica',
      boldFontFamily: 'Helvetica-Bold',
      paragraph: { marginBottomPt: 8 },
      headings: [
        { fontSizePt: 16, marginTopPt: 16, marginBottomPt: 8 },
        { fontSizePt: 14, marginTopPt: 12, marginBottomPt: 6 },
        { fontSizePt: 12, marginTopPt: 10, marginBottomPt: 4 },
      ],
      list: { paddingLeftPt: 8, markerWidthPt: 16, marginBottomPt: 4, itemMarginBottomPt: 2 },
      blockquote: {
        borderWidthPt: 2,
        borderColor: '#9ca3af',
        paddingLeftPt: 10,
        marginBottomPt: 8,
        color: '#4b5563',
      },
      rule: { widthPt: 1, color: '#9ca3af', marginVerticalPt: 10 },
    });
  });
});
