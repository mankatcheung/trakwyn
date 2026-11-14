import type { IPdfRenderer, PdfRenderData } from '#src/use-cases/ports/IPdfRenderer.js';
import type { JSONContent } from '@tiptap/core';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import { createNodeRenderer } from './renderNode.js';
import { DOCUMENT_PAGE } from './documentPage.js';

function extractTextFromNode(node: JSONContent): string {
  if (node.text) return node.text;

  const childTexts = (node.content ?? []).map(extractTextFromNode);
  let text = childTexts.join('');

  if (node.type === 'paragraph' || node.type === 'heading') {
    text += '\n';
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    text += '\n';
  }
  if (node.type === 'listItem') {
    text = '- ' + text;
  }

  return text;
}

export function prosemirrorToPlainText(json: string): string {
  try {
    const content = JSON.parse(json) as JSONContent;
    return extractTextFromNode(content)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return '';
  }
}

/**
 * PDF renderer using @react-pdf/renderer.
 * Converts TipTap/ProseMirror JSON to a PDF buffer.
 */
export class ReactPdfDocumentRenderer implements IPdfRenderer {
  constructor(private readonly deps: { logger?: ILogger } = {}) {}

  async render(data: PdfRenderData): Promise<Buffer> {
    const { Document, Page, Text, View, StyleSheet, renderToBuffer } =
      await import('@react-pdf/renderer');

    const page = DOCUMENT_PAGE;
    const [h1, h2, h3] = page.headings;
    const styles = StyleSheet.create({
      page: {
        padding: page.paddingPt,
        fontSize: page.fontSizePt,
        fontFamily: page.fontFamily,
        lineHeight: page.lineHeight,
      },
      title: {
        fontSize: 18,
        fontFamily: page.boldFontFamily,
        marginBottom: 16,
      },
      heading1: {
        fontSize: h1.fontSizePt,
        fontFamily: page.boldFontFamily,
        marginBottom: h1.marginBottomPt,
        marginTop: h1.marginTopPt,
      },
      heading2: {
        fontSize: h2.fontSizePt,
        fontFamily: page.boldFontFamily,
        marginBottom: h2.marginBottomPt,
        marginTop: h2.marginTopPt,
      },
      heading3: {
        fontSize: h3.fontSizePt,
        fontFamily: page.boldFontFamily,
        marginBottom: h3.marginBottomPt,
        marginTop: h3.marginTopPt,
      },
      paragraph: {
        marginBottom: page.paragraph.marginBottomPt,
      },
      listParagraph: {
        marginBottom: page.list.itemMarginBottomPt,
      },
      list: {
        marginBottom: page.list.marginBottomPt,
        paddingLeft: page.list.paddingLeftPt,
      },
      nestedList: {
        marginTop: 2,
      },
      listItem: {
        flexDirection: 'row',
        marginBottom: page.list.itemMarginBottomPt,
      },
      listMarker: {
        width: page.list.markerWidthPt,
      },
      listContent: {
        flex: 1,
      },
      blockquote: {
        borderLeftWidth: page.blockquote.borderWidthPt,
        borderLeftColor: page.blockquote.borderColor,
        borderLeftStyle: 'solid',
        paddingLeft: page.blockquote.paddingLeftPt,
        marginBottom: page.blockquote.marginBottomPt,
        color: page.blockquote.color,
      },
      // A table (JEF-582): equal-width columns, 1pt borders, the cell text a little tighter.
      table: {
        marginBottom: 8,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: '#9ca3af',
        borderStyle: 'solid',
      },
      tableRow: {
        flexDirection: 'row',
      },
      tableCell: {
        flex: 1,
        padding: 4,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#9ca3af',
        borderStyle: 'solid',
      },
      tableHeaderCell: {
        flex: 1,
        padding: 4,
        backgroundColor: '#f3f4f6',
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#9ca3af',
        borderStyle: 'solid',
      },
      cellParagraph: {
        marginBottom: 2,
      },
      cellHeaderParagraph: {
        fontFamily: 'Helvetica-Bold',
        marginBottom: 2,
      },
      rule: {
        borderTopWidth: page.rule.widthPt,
        borderTopColor: page.rule.color,
        borderTopStyle: 'solid',
        marginVertical: page.rule.marginVerticalPt,
      },
    });

    let content: JSONContent;
    try {
      content = JSON.parse(data.contentJson);
    } catch {
      content = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
      };
    }

    const renderNode = createNodeRenderer({
      pdf: { Text, View },
      styles,
      logger: this.deps.logger,
    });

    const doc = (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={styles.title}>{data.title}</Text>
          {renderNode(content)}
        </Page>
      </Document>
    );

    const buffer = await renderToBuffer(doc);
    return Buffer.from(buffer);
  }
}
