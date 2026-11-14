/**
 * The page the PDF export prints, in points (what `@react-pdf/renderer` takes).
 *
 * The web editor draws the draft on a page of the same size and spacing, so what
 * is typed looks like what is exported (JEF-581). The web app does not share
 * code with the API, so the same numbers are written out in
 * `apps/web/src/lib/documentPage.ts`, and a test on each side pins them to the
 * other: change a value here and `documentPage.test.ts` fails until the web file
 * and its test follow, and the reverse.
 */
export const DOCUMENT_PAGE = {
  /** A4. The renderer asks for `size="A4"`; the editor's column is this wide. */
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
    // Level 3 and deeper.
    { fontSizePt: 12, marginTopPt: 10, marginBottomPt: 4 },
  ],
  list: {
    paddingLeftPt: 8,
    markerWidthPt: 16,
    marginBottomPt: 4,
    itemMarginBottomPt: 2,
  },
  blockquote: {
    borderWidthPt: 2,
    borderColor: '#9ca3af',
    paddingLeftPt: 10,
    marginBottomPt: 8,
    color: '#4b5563',
  },
  rule: { widthPt: 1, color: '#9ca3af', marginVerticalPt: 10 },
} as const;
