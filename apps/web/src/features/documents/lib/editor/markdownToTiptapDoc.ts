/**
 * A small Markdown to TipTap converter for the AI helper (JEF-506).
 *
 * The polish action answers in Markdown; the editor is TipTap with StarterKit.
 * Only what StarterKit can show is understood: headings, paragraphs, bullet
 * and ordered lists, bold and italic. Anything else (links, code, tables)
 * stays as plain text rather than being dropped. Empty text nodes are never
 * produced, because ProseMirror throws on them (see `proseToTiptapDoc`).
 */

export interface TiptapMark {
  type: 'bold' | 'italic';
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
// Groups: 1 `**bold**`, 2 `__bold__`, 3 `*italic*`, 4 `_italic_`. Underscore emphasis
// only counts at a word boundary, so `john_doe_x@mail.com` and `github.com/foo_bar_baz`
// stay text.
const INLINE =
  /\*\*([^*]+)\*\*|(?<![A-Za-z0-9_])__([^_]+)__(?![A-Za-z0-9_])|\*([^*\s][^*]*)\*|(?<![A-Za-z0-9_])_([^_\s][^_]*)_(?![A-Za-z0-9_])/g;

function textNode(text: string, marks?: TiptapMark): TiptapNode {
  return marks ? { type: 'text', text, marks: [marks] } : { type: 'text', text };
}

/** Bold and italic spans in one line of text. */
function parseInline(line: string): TiptapNode[] {
  const nodes: TiptapNode[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    if (match.index > last) nodes.push(textNode(line.slice(last, match.index)));
    const bold = match[1] ?? match[2];
    nodes.push(
      bold !== undefined
        ? textNode(bold, { type: 'bold' })
        : textNode((match[3] ?? match[4])!, { type: 'italic' }),
    );
    last = match.index + match[0].length;
  }
  if (last < line.length) nodes.push(textNode(line.slice(last)));
  return nodes;
}

/** One paragraph; the lines of a soft-wrapped block stay on separate lines (hard breaks). */
function paragraph(...lines: string[]): TiptapNode {
  const content = lines.flatMap((line, i) =>
    i === 0 ? parseInline(line) : [{ type: 'hardBreak' }, ...parseInline(line)],
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

  const closeParagraph = () => {
    if (paragraphLines.length > 0) nodes.push(paragraph(...paragraphLines));
    paragraphLines = [];
  };
  const closeList = () => {
    if (list) nodes.push(listNode(list.type, list.items));
    list = null;
  };

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);

    if (line.trim() === '' || RULE.test(line)) {
      closeParagraph();
      closeList();
    } else if (heading) {
      closeParagraph();
      closeList();
      nodes.push({
        type: 'heading',
        attrs: { level: heading[1]!.length },
        content: parseInline(heading[2]!),
      });
    } else if (bullet || ordered) {
      closeParagraph();
      const type = bullet ? 'bulletList' : 'orderedList';
      const text = (bullet ?? ordered)![1]!;
      if (list && list.type !== type) closeList();
      if (list) list.items.push(text);
      else list = { type, items: [text] };
    } else {
      closeList();
      paragraphLines.push(line.trim());
    }
  }
  closeParagraph();
  closeList();
  return nodes;
}

function nodeText(node: TiptapNode): string {
  if (node.text !== undefined) return node.text;
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(nodeText).join('');
}

/** Plain text in the shape `editor.getText()` gives: blocks separated by a blank line. */
export function tiptapNodesToPlainText(nodes: TiptapNode[]): string {
  const blocks = nodes.flatMap((node) =>
    node.type === 'bulletList' || node.type === 'orderedList'
      ? (node.content ?? []).map(nodeText)
      : [nodeText(node)],
  );
  return blocks.join('\n\n').trim();
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
