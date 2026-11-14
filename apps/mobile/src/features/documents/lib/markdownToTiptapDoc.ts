/**
 * Mobile twin of apps/web's `lib/markdownToTiptapDoc.ts` (JEF-586), widened to
 * what the mobile editor's Markdown can say: headings, paragraphs (a soft line
 * break is a hard break), bullet and ordered lists, quotes, rules, and bold,
 * italic, strike and link marks. The mobile editor has no ProseMirror, so this
 * is what turns the text on screen back into the document the API stores.
 *
 * Empty text nodes are never produced, because ProseMirror throws on them.
 * Links only survive with a URL `isSafeMarkdownUrl` accepts; anything else stays
 * as the literal text. `\*`-style escapes (written by `tiptapToMarkdown`) give
 * back the literal character.
 */
import { isSafeMarkdownUrl } from '../../../lib/safeMarkdownUrl';
import type { TiptapMark, TiptapNode } from './tiptapTypes';

export type { TiptapMark, TiptapNode } from './tiptapTypes';

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
// Groups: 1 escaped char, 2 link text, 3 link url, 4 `**bold**`, 5 `__bold__`,
// 6 `~~strike~~`, 7 `*italic*`, 8 `_italic_`. Underscore emphasis only counts at a
// word boundary, so `john_doe_x@mail.com` and `github.com/foo_bar_baz` stay text.
const INLINE =
  /\\([\\*_~[\]#>+.()!-])|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*(?!\*)|(?<![A-Za-z0-9_])__(.+?)__(?![A-Za-z0-9_])|~~(.+?)~~|\*([^*\s](?:[^*]*[^*\s])?)\*|(?<![A-Za-z0-9_])_([^_\s](?:[^_]*[^_\s])?)_(?![A-Za-z0-9_])/g;

function sameMarks(a: TiptapMark[] | undefined, b: TiptapMark[] | undefined): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Joins neighbouring text nodes that carry the same marks. */
function mergeText(nodes: TiptapNode[]): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev.type === 'text' && node.type === 'text' && sameMarks(prev.marks, node.marks)) {
      out[out.length - 1] = { ...prev, text: `${prev.text}${node.text}` };
    } else {
      out.push(node);
    }
  }
  return out;
}

function withMark(nodes: TiptapNode[], mark: TiptapMark): TiptapNode[] {
  return nodes.map((node) => ({ ...node, marks: [mark, ...(node.marks ?? [])] }));
}

function plain(text: string): TiptapNode[] {
  return text.length > 0 ? [{ type: 'text', text }] : [];
}

function inlineNodes(line: string): TiptapNode[] {
  const nodes: TiptapNode[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    nodes.push(...plain(line.slice(last, match.index)));
    last = match.index + match[0].length;
    const [whole, escaped, linkText, linkUrl, bold1, bold2, strike, italic1, italic2] = match;
    if (escaped !== undefined) {
      nodes.push(...plain(escaped));
    } else if (linkText !== undefined) {
      const href = linkUrl!;
      nodes.push(
        ...(isSafeMarkdownUrl(href)
          ? withMark(inlineNodes(linkText), { type: 'link', attrs: { href } })
          : plain(whole)),
      );
    } else if (bold1 !== undefined || bold2 !== undefined) {
      nodes.push(...withMark(inlineNodes((bold1 ?? bold2)!), { type: 'bold' }));
    } else if (strike !== undefined) {
      nodes.push(...withMark(inlineNodes(strike), { type: 'strike' }));
    } else {
      nodes.push(...withMark(inlineNodes((italic1 ?? italic2)!), { type: 'italic' }));
    }
  }
  nodes.push(...plain(line.slice(last)));
  return mergeText(nodes);
}

/** One paragraph; the lines of a soft-wrapped block stay on separate lines (hard breaks). */
function paragraph(...lines: string[]): TiptapNode {
  const content = lines.flatMap((line, i) =>
    i === 0 ? inlineNodes(line) : [{ type: 'hardBreak' }, ...inlineNodes(line)],
  );
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function listNode(type: 'bulletList' | 'orderedList', items: string[]): TiptapNode {
  return {
    type,
    content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
  };
}

/** The block nodes for a Markdown string, in order. */
export function markdownToTiptapNodes(markdown: string): TiptapNode[] {
  const nodes: TiptapNode[] = [];
  let paragraphLines: string[] = [];
  let list: { type: 'bulletList' | 'orderedList'; items: string[] } | null = null;
  let quoteLines: string[] = [];

  const closeParagraph = () => {
    if (paragraphLines.length > 0) nodes.push(paragraph(...paragraphLines));
    paragraphLines = [];
  };
  const closeList = () => {
    if (list) nodes.push(listNode(list.type, list.items));
    list = null;
  };
  const closeQuote = () => {
    if (quoteLines.length > 0) {
      const inner = markdownToTiptapNodes(quoteLines.join('\n'));
      nodes.push({
        type: 'blockquote',
        content: inner.length > 0 ? inner : [{ type: 'paragraph' }],
      });
    }
    quoteLines = [];
  };
  const closeAll = () => {
    closeParagraph();
    closeList();
    closeQuote();
  };

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = HEADING.exec(line);
    const quote = QUOTE.exec(line);
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);

    if (quote) {
      closeParagraph();
      closeList();
      quoteLines.push(quote[1]!);
    } else if (line.trim() === '') {
      closeAll();
    } else if (RULE.test(line)) {
      closeAll();
      nodes.push({ type: 'horizontalRule' });
    } else if (heading) {
      closeAll();
      nodes.push({
        type: 'heading',
        attrs: { level: heading[1]!.length },
        content: inlineNodes(heading[2]!),
      });
    } else if (bullet || ordered) {
      closeParagraph();
      closeQuote();
      const type = bullet ? 'bulletList' : 'orderedList';
      const text = (bullet ?? ordered)![1]!;
      if (list && list.type !== type) closeList();
      if (list) list.items.push(text);
      else list = { type, items: [text] };
    } else {
      closeList();
      closeQuote();
      paragraphLines.push(line.trim());
    }
  }
  closeAll();
  return nodes;
}

function nodeText(node: TiptapNode): string {
  if (node.text !== undefined) return node.text;
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'blockquote') return (node.content ?? []).map(nodeText).join('\n\n');
  return (node.content ?? []).map(nodeText).join('');
}

/** Plain text in the shape `editor.getText()` gives: blocks separated by a blank line. */
export function tiptapNodesToPlainText(nodes: TiptapNode[]): string {
  const blocks = nodes.flatMap((node) =>
    node.type === 'bulletList' || node.type === 'orderedList'
      ? (node.content ?? []).map(nodeText)
      : [nodeText(node)],
  );
  return blocks
    .filter((block) => block !== '')
    .join('\n\n')
    .trim();
}

/** A whole TipTap document for a Markdown string. An empty string gives one empty paragraph. */
export function markdownToTiptapDoc(markdown: string): {
  contentJson: string;
  plainText: string;
} {
  const nodes = markdownToTiptapNodes(markdown);
  const content = nodes.length > 0 ? nodes : [{ type: 'paragraph' }];
  return {
    contentJson: JSON.stringify({ type: 'doc', content }),
    plainText: tiptapNodesToPlainText(nodes),
  };
}
