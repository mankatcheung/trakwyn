import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCUMENT_FONT_STACK, DOCUMENT_PAGE, documentPageStyle } from '#/lib/documentPage';

/*
 * The editor draws a draft on the page the PDF export prints (JEF-581). The API
 * owns the PDF's numbers in `apps/api/src/infrastructure/pdf/documentPage.ts`;
 * its test holds the same literal as this one. Change one and both fail until
 * the other side matches, so the editor cannot drift from the PDF.
 */
describe('DOCUMENT_PAGE', () => {
  it("is the page the PDF export prints (apps/api's documentPage.ts)", () => {
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

  it('is A4 wide: 210 mm', () => {
    expect((DOCUMENT_PAGE.widthPt / 72) * 25.4).toBeCloseTo(210, 0);
  });
});

describe('documentPageStyle', () => {
  const style = documentPageStyle() as Record<string, string | number>;

  it('sets the page width and margin from the PDF, in points', () => {
    expect(style['--doc-width']).toBe('595.28pt');
    expect(style['--doc-padding']).toBe('40pt');
  });

  it('sets the heading sizes and spacing from the PDF', () => {
    expect([1, 2, 3].map((n) => style[`--doc-h${n}-size`])).toEqual(['16pt', '14pt', '12pt']);
    expect([1, 2, 3].map((n) => style[`--doc-h${n}-mt`])).toEqual(['16pt', '12pt', '10pt']);
    expect([1, 2, 3].map((n) => style[`--doc-h${n}-mb`])).toEqual(['8pt', '6pt', '4pt']);
  });

  it('sets the text, list, quote and rule values from the PDF', () => {
    expect(style['--doc-font-size']).toBe('11pt');
    expect(style['--doc-line-height']).toBe(1.5);
    expect(style['--doc-p-mb']).toBe('8pt');
    // The PDF's list padding plus its marker column.
    expect(style['--doc-list-indent']).toBe('24pt');
    expect(style['--doc-quote-border']).toBe('2pt');
    expect(style['--doc-rule-my']).toBe('10pt');
  });

  it('asks for Helvetica first, with a metric-compatible fallback', () => {
    expect(style['--doc-font-family']).toBe(DOCUMENT_FONT_STACK);
    expect(DOCUMENT_FONT_STACK.startsWith('Helvetica,')).toBe(true);
    expect(DOCUMENT_FONT_STACK).toContain('Arial');
  });
});

describe('the .document-page stylesheet', () => {
  const css = readFileSync(join(import.meta.dirname, '..', '..', 'styles.css'), 'utf8');
  const block = css.slice(css.indexOf('.document-page {'));

  it('reads every number from a custom property and holds none of its own', () => {
    // Only the list nesting gap (2pt) and the phone padding floor are written here.
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '');
    const literals = [...code.matchAll(/(\d+(?:\.\d+)?)pt\b/g)].map((m) => m[0]);
    expect(literals).toEqual(['2pt']);
  });

  it('is A4 wide at most and shrinks with the screen, so a phone never scrolls sideways', () => {
    expect(block).toMatch(/width:\s*100%/);
    expect(block).toMatch(/max-width:\s*var\(--doc-width\)/);
  });

  it('keeps the page white; dark mode changes only the surround', () => {
    expect(block).toMatch(/\.document-page\s*{[^}]*background:\s*#fff/);
    expect(block).not.toMatch(/dark/);
  });
});
