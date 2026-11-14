import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { markdownToTiptapNodes, type TiptapNode } from '#/lib/markdownToTiptapDoc';

/**
 * What an inline AI action may replace (JEF-583). Mixed formatting inside a
 * sentence is flattened by a rewrite, and a rewrite cannot be spliced into a
 * selection that starts in one block and ends in the middle of another, so the
 * selection has to be inside a single block, or be whole blocks at the top level.
 */
export type SelectionKind = 'inline' | 'blocks';

export interface AiRange {
  kind: SelectionKind;
  /** The positions the proposal replaces; for `blocks`, snapped to the blocks' edges. */
  from: number;
  to: number;
  /** What is sent to the model, and what the proposal is checked against on Accept. */
  text: string;
  /** The range holds bold, italic, links or the like, which a rewrite may flatten. */
  hasMarks: boolean;
}

const BLOCK_SEPARATOR = '\n\n';

function rangeHasMarks(doc: PMNode, from: number, to: number): boolean {
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    if (node.isText && node.marks.length > 0) found = true;
    return !found;
  });
  return found;
}

/** The text a range holds, read the same way when it is sent and when it is checked again. */
export function rangeText(doc: PMNode, from: number, to: number): string {
  return doc.textBetween(from, to, BLOCK_SEPARATOR, ' ');
}

/**
 * The range an AI action would replace for this selection, or null when it is
 * empty, holds no text, or is not one block or whole top-level blocks.
 */
export function describeRange(doc: PMNode, from: number, to: number): AiRange | null {
  if (from >= to) return null;

  // Select all: the whole document.
  if (from <= 0 && to >= doc.content.size) {
    const text = rangeText(doc, 0, doc.content.size);
    return text.trim() === ''
      ? null
      : {
          kind: 'blocks',
          from: 0,
          to: doc.content.size,
          text,
          hasMarks: rangeHasMarks(doc, 0, doc.content.size),
        };
  }

  const $from = doc.resolve(from);
  const $to = doc.resolve(to);

  if ($from.parent === $to.parent && $from.parent.isTextblock) {
    const text = doc.textBetween(from, to);
    return text.trim() === ''
      ? null
      : { kind: 'inline', from, to, text, hasMarks: rangeHasMarks(doc, from, to) };
  }

  const wholeBlocks =
    $from.parent.isTextblock &&
    $to.parent.isTextblock &&
    $from.depth === 1 &&
    $to.depth === 1 &&
    $from.parentOffset === 0 &&
    $to.parentOffset === $to.parent.content.size;
  if (!wholeBlocks) return null;

  const start = $from.before();
  const end = $to.after();
  const text = rangeText(doc, start, end);
  return text.trim() === ''
    ? null
    : { kind: 'blocks', from: start, to: end, text, hasMarks: rangeHasMarks(doc, start, end) };
}

/** The whole text of the block holding `pos`, as an inline range; null for an empty block. */
export function describeBlockAt(doc: PMNode, pos: number): AiRange | null {
  const $pos = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.isTextblock) {
      const from = $pos.start(depth);
      return describeRange(doc, from, from + node.content.size);
    }
  }
  return null;
}

/** The whole document as one range. */
export function describeDocument(doc: PMNode): AiRange | null {
  return describeRange(doc, 0, doc.content.size);
}

function inlineOf(node: TiptapNode): TiptapNode[] {
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return (node.content ?? []).flatMap((item) => (item.content ?? []).flatMap(inlineOf));
  }
  return node.content ?? [];
}

/**
 * What goes into the document for a proposal. Whole blocks take the model's
 * blocks as they are. A passage inside a block takes only text: several blocks
 * are joined with a space, and a heading or list marker is dropped, so the
 * block the selection sits in keeps its own type.
 */
export function proposalContent(range: AiRange, markdown: string): TiptapNode[] | null {
  const blocks = markdownToTiptapNodes(markdown);
  if (blocks.length === 0) return null;
  if (range.kind === 'blocks') return blocks;

  const pieces = blocks.map(inlineOf).filter((nodes) => nodes.length > 0);
  if (pieces.length === 0) return null;
  const joined = pieces.flatMap((nodes, i) =>
    i === 0 ? nodes : [{ type: 'text', text: ' ' } as TiptapNode, ...nodes],
  );
  return joined;
}

/**
 * Puts `content` in place of a range as one transaction, so one undo restores
 * the original. The editor's own update event is suppressed: the caller saves
 * the result itself, as an AI replacement (draft history keeps what it replaced).
 */
export function replaceRangeWithContent(
  editor: Editor,
  from: number,
  to: number,
  content: TiptapNode[],
): boolean {
  return editor
    .chain()
    .command(({ tr }) => {
      tr.setMeta('preventUpdate', true);
      return true;
    })
    .insertContentAt({ from, to }, content)
    .run();
}
