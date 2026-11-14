import { Fragment, type ReactNode } from 'react';
import type { JSONContent } from '@tiptap/core';
import type { Style } from '@react-pdf/types';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

type PdfComponents = Pick<typeof import('@react-pdf/renderer'), 'Text' | 'View'>;

/** What a node needs to know about the list it sits in. */
interface ListContext {
  readonly ordered: boolean;
  readonly start: number;
  readonly depth: number;
}

/** Where a paragraph sits in a table: a header cell prints bold, a body cell tight. */
type CellKind = 'header' | 'body' | null;

interface RenderContext {
  readonly list: ListContext | null;
  readonly cell: CellKind;
}

export interface PdfStyles {
  readonly [name: string]: Style;
}

interface Deps {
  readonly pdf: PdfComponents;
  readonly styles: PdfStyles;
  readonly logger?: ILogger;
}

type NodeRenderer = (node: JSONContent, key: number, ctx: RenderContext) => ReactNode;

/** A link is printed, never made live: see ReactPdfDocumentRenderer.test.ts (JEF-548). */
const PRINTABLE_LINK = /^(https?:|mailto:)/i;

const LINK_COLOR = '#1a56db';

/**
 * The highlight the editor offers (JEF-582): one soft yellow. The editor paints
 * the same colour in `apps/web/src/styles.css`; its test holds this literal too.
 * The colour is not read from the document, so a model-written mark cannot set
 * an arbitrary one.
 */
export const HIGHLIGHT_COLOR = '#fef08a';

function fontFor(bold: boolean, italic: boolean): string {
  if (bold && italic) return 'Helvetica-BoldOblique';
  if (bold) return 'Helvetica-Bold';
  if (italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function styleForMarks(marks: NonNullable<JSONContent['marks']>): Style {
  const types = new Set(marks.map((mark) => mark.type));
  const decorations = [
    types.has('underline') || types.has('link') ? 'underline' : null,
    types.has('strike') ? 'line-through' : null,
  ].filter((value): value is string => value !== null);

  return {
    ...(types.has('bold') || types.has('italic')
      ? { fontFamily: fontFor(types.has('bold'), types.has('italic')) }
      : {}),
    ...(decorations.length > 0
      ? { textDecoration: decorations.join(' ') as Style['textDecoration'] }
      : {}),
    ...(types.has('link') ? { color: LINK_COLOR } : {}),
    ...(types.has('highlight') ? { backgroundColor: HIGHLIGHT_COLOR } : {}),
  };
}

/**
 * Alignment the editor can set (JEF-578). Anything else, including justify
 * and the default left, prints as before, so existing documents are unchanged.
 */
const ALIGNMENTS = new Set(['center', 'right']);

function withAlignment(style: Style, node: JSONContent): Style | Style[] {
  const align = node.attrs?.textAlign;
  return typeof align === 'string' && ALIGNMENTS.has(align)
    ? [style, { textAlign: align as Style['textAlign'] }]
    : style;
}

function linkHref(node: JSONContent): string | null {
  const href = node.marks?.find((mark) => mark.type === 'link')?.attrs?.href;
  return typeof href === 'string' && PRINTABLE_LINK.test(href) ? href : null;
}

/**
 * Builds the function that turns a ProseMirror document into react-pdf
 * elements. Each node type is one entry in `renderers`, so a new editor node
 * adds a mapping rather than another branch. A type with no entry renders its
 * children, so text is never lost, and is logged once per render.
 */
export function createNodeRenderer({ pdf, styles, logger }: Deps): (doc: JSONContent) => ReactNode {
  const { Text, View } = pdf;
  const unknownTypes = new Set<string>();

  const children = (node: JSONContent, ctx: RenderContext): ReactNode[] =>
    (node.content ?? []).map((child, i) => render(child, i, ctx));

  const renderers: Record<string, NodeRenderer> = {
    doc: (node, _key, ctx) => children(node, ctx),

    heading: (node, key, ctx) => {
      const level = node.attrs?.level ?? 1;
      const style = level === 1 ? styles.heading1 : level === 2 ? styles.heading2 : styles.heading3;
      return (
        <Text key={key} style={withAlignment(style, node)}>
          {children(node, ctx)}
        </Text>
      );
    },

    paragraph: (node, key, ctx) => (
      <Text key={key} style={withAlignment(paragraphStyle(ctx), node)}>
        {children(node, ctx)}
      </Text>
    ),

    bulletList: (node, key, ctx) => listNode(node, key, ctx, false, 1),

    orderedList: (node, key, ctx) => {
      const start = Number(node.attrs?.start);
      return listNode(node, key, ctx, true, Number.isInteger(start) ? start : 1);
    },

    listItem: (node, key, ctx) => {
      const list = ctx.list ?? { ordered: false, start: 1, depth: 0 };
      return (
        <View key={key} style={styles.listItem}>
          <Text style={styles.listMarker}>{list.ordered ? `${list.start + key}.` : '•'}</Text>
          <View style={styles.listContent}>{children(node, ctx)}</View>
        </View>
      );
    },

    blockquote: (node, key, ctx) => (
      <View key={key} style={styles.blockquote}>
        {children(node, { ...ctx, list: null })}
      </View>
    ),

    // Equal-width columns filling the page: simple, and long text wraps inside its cell.
    table: (node, key, ctx) => (
      <View key={key} style={styles.table}>
        {children(node, { ...ctx, list: null })}
      </View>
    ),

    tableRow: (node, key, ctx) => (
      <View key={key} style={styles.tableRow} wrap={false}>
        {children(node, ctx)}
      </View>
    ),

    tableHeader: (node, key, ctx) => (
      <View key={key} style={styles.tableHeaderCell}>
        {children(node, { ...ctx, cell: 'header' })}
      </View>
    ),

    tableCell: (node, key, ctx) => (
      <View key={key} style={styles.tableCell}>
        {children(node, { ...ctx, cell: 'body' })}
      </View>
    ),

    horizontalRule: (_node, key) => <View key={key} style={styles.rule} />,

    hardBreak: (_node, key) => <Text key={key}>{'\n'}</Text>,

    text: (node, key) => {
      const href = linkHref(node);
      const text = node.text ?? '';
      // The URL follows the words so a printed copy still says where it goes.
      const printed = href && text !== href ? `${text} (${href})` : text;
      return (
        <Text key={key} style={styleForMarks(node.marks ?? [])}>
          {printed}
        </Text>
      );
    },
  };

  function paragraphStyle(ctx: RenderContext): Style {
    if (ctx.cell === 'header') return styles.cellHeaderParagraph!;
    if (ctx.cell === 'body') return styles.cellParagraph!;
    return (ctx.list ? styles.listParagraph : styles.paragraph)!;
  }

  function listNode(
    node: JSONContent,
    key: number,
    ctx: RenderContext,
    ordered: boolean,
    start: number,
  ): ReactNode {
    const list: ListContext = { ordered, start, depth: (ctx.list?.depth ?? -1) + 1 };
    return (
      <View key={key} style={list.depth === 0 ? styles.list : styles.nestedList}>
        {children(node, { ...ctx, list })}
      </View>
    );
  }

  function render(node: JSONContent, key: number, ctx: RenderContext): ReactNode {
    const renderer = node.type ? renderers[node.type] : undefined;
    if (renderer) return renderer(node, key, ctx);

    const type = node.type ?? 'unknown';
    if (!unknownTypes.has(type)) {
      unknownTypes.add(type);
      logger?.warn('PDF export met a node type with no renderer', undefined, {
        event: 'pdf.export.unknown_node',
        nodeType: type,
      });
    }
    return <Fragment key={key}>{children(node, ctx)}</Fragment>;
  }

  return (doc) => render(doc, 0, { list: null, cell: null });
}
