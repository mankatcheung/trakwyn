import type { IPdfRenderer, PdfRenderData } from '#src/use-cases/ports/IPdfRenderer.js';
import type { JSONContent } from '@tiptap/core';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import { createNodeRenderer } from './renderNode.js';

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

    const styles = StyleSheet.create({
      page: {
        padding: 40,
        fontSize: 11,
        fontFamily: 'Helvetica',
        lineHeight: 1.5,
      },
      title: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 16,
      },
      heading1: {
        fontSize: 16,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 8,
        marginTop: 16,
      },
      heading2: {
        fontSize: 14,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 6,
        marginTop: 12,
      },
      heading3: {
        fontSize: 12,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 4,
        marginTop: 10,
      },
      paragraph: {
        marginBottom: 8,
      },
      listParagraph: {
        marginBottom: 2,
      },
      list: {
        marginBottom: 4,
        paddingLeft: 8,
      },
      nestedList: {
        marginTop: 2,
      },
      listItem: {
        flexDirection: 'row',
        marginBottom: 2,
      },
      listMarker: {
        width: 16,
      },
      listContent: {
        flex: 1,
      },
      blockquote: {
        borderLeftWidth: 2,
        borderLeftColor: '#9ca3af',
        borderLeftStyle: 'solid',
        paddingLeft: 10,
        marginBottom: 8,
        color: '#4b5563',
      },
      rule: {
        borderTopWidth: 1,
        borderTopColor: '#9ca3af',
        borderTopStyle: 'solid',
        marginVertical: 10,
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
