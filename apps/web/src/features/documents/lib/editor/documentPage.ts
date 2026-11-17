import type { CSSProperties } from 'react';

/**
 * The page the editor draws, in points: the same numbers the PDF export prints
 * with (JEF-581), so what is typed looks like what is exported.
 *
 * The API owns the PDF's copy in `apps/api/src/infrastructure/pdf/documentPage.ts`
 * and the two apps share no code, so a test on each side pins the numbers to the
 * other. Change a value here and `documentPage.test.ts` fails until the API file
 * and its test follow, and the reverse. CSS takes `pt` directly, so no unit
 * conversion can drift.
 */
export const DOCUMENT_PAGE = {
  /** A4. The editor's column is this wide, or the screen's width if that is less. */
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

/**
 * Helvetica is what the PDF uses; the editor asks for it first and falls back to
 * the metric-compatible faces other systems have, so line breaks stay close.
 */
export const DOCUMENT_FONT_STACK = `${DOCUMENT_PAGE.fontFamily}, Arial, 'Liberation Sans', 'Helvetica Neue', sans-serif`;

const pt = (value: number) => `${value}pt`;

/**
 * The page's numbers as CSS custom properties, read by the `.document-page`
 * rules in `styles.css`. Set inline so those rules hold no number of their own.
 */
export function documentPageStyle(): CSSProperties {
  const { headings, list, blockquote, rule, paragraph } = DOCUMENT_PAGE;
  const vars: Record<string, string | number> = {
    '--doc-width': pt(DOCUMENT_PAGE.widthPt),
    '--doc-padding': pt(DOCUMENT_PAGE.paddingPt),
    '--doc-font-size': pt(DOCUMENT_PAGE.fontSizePt),
    '--doc-line-height': DOCUMENT_PAGE.lineHeight,
    '--doc-font-family': DOCUMENT_FONT_STACK,
    '--doc-p-mb': pt(paragraph.marginBottomPt),
    '--doc-list-indent': pt(list.paddingLeftPt + list.markerWidthPt),
    '--doc-list-mb': pt(list.marginBottomPt),
    '--doc-item-mb': pt(list.itemMarginBottomPt),
    '--doc-quote-border': pt(blockquote.borderWidthPt),
    '--doc-quote-border-color': blockquote.borderColor,
    '--doc-quote-padding': pt(blockquote.paddingLeftPt),
    '--doc-quote-mb': pt(blockquote.marginBottomPt),
    '--doc-quote-color': blockquote.color,
    '--doc-rule-width': pt(rule.widthPt),
    '--doc-rule-color': rule.color,
    '--doc-rule-my': pt(rule.marginVerticalPt),
  };
  headings.forEach((heading, i) => {
    vars[`--doc-h${i + 1}-size`] = pt(heading.fontSizePt);
    vars[`--doc-h${i + 1}-mt`] = pt(heading.marginTopPt);
    vars[`--doc-h${i + 1}-mb`] = pt(heading.marginBottomPt);
  });
  return vars as CSSProperties;
}
