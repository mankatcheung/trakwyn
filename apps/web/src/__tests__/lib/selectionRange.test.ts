import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  describeBlockAt,
  describeDocument,
  describeRange,
  proposalContent,
  rangeText,
  replaceRangeWithContent,
} from '#/lib/editor/selectionRange';

const p = (text: string, bold = false) =>
  text === ''
    ? { type: 'paragraph' }
    : {
        type: 'paragraph',
        content: [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }],
      };

function makeEditor(content: object[]) {
  return new Editor({ extensions: [StarterKit], content: { type: 'doc', content } });
}

/** The start position of the text node `needle` in the document. */
function posOf(editor: Editor, needle: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(needle))
      found = pos + node.text.indexOf(needle);
  });
  return found;
}

describe('describeRange (JEF-583)', () => {
  const editor = makeEditor([
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Jane Doe' }] },
    p('Led a team of six engineers.'),
    p('Shipped twelve releases.'),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('inside a list')] }] },
  ]);
  const doc = editor.state.doc;

  it('accepts text inside one block', () => {
    const from = posOf(editor, 'team');
    const range = describeRange(doc, from, from + 4);
    expect(range).toMatchObject({ kind: 'inline', from, to: from + 4, text: 'team' });
  });

  it('accepts text inside a list item', () => {
    const from = posOf(editor, 'inside');
    expect(describeRange(doc, from, from + 6)?.kind).toBe('inline');
  });

  it('accepts whole top-level blocks and snaps to their edges', () => {
    const start = posOf(editor, 'Led');
    const end = posOf(editor, 'Shipped twelve releases.') + 'Shipped twelve releases.'.length;
    const range = describeRange(doc, start, end)!;
    expect(range.kind).toBe('blocks');
    expect(range.from).toBe(start - 1);
    expect(range.to).toBe(end + 1);
    expect(range.text).toBe('Led a team of six engineers.\n\nShipped twelve releases.');
  });

  it('accepts the whole document', () => {
    const range = describeDocument(doc)!;
    expect(range.kind).toBe('blocks');
    expect(range.from).toBe(0);
    expect(range.to).toBe(doc.content.size);
  });

  it('refuses a selection that starts in one block and ends partway into another', () => {
    const from = posOf(editor, 'team');
    const to = posOf(editor, 'Shipped') + 3;
    expect(describeRange(doc, from, to)).toBeNull();
  });

  it('refuses an empty selection and one with no text', () => {
    const at = posOf(editor, 'team');
    expect(describeRange(doc, at, at)).toBeNull();
    const blank = makeEditor([p('  ')]);
    expect(describeRange(blank.state.doc, 1, 3)).toBeNull();
  });

  it('says when the range holds formatting a rewrite may flatten', () => {
    const marked = makeEditor([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'plain ' }, ...p('bold', true).content!],
      },
    ]);
    expect(describeRange(marked.state.doc, 1, 11)?.hasMarks).toBe(true);
    expect(describeRange(marked.state.doc, 1, 4)?.hasMarks).toBe(false);
  });
});

describe('describeBlockAt', () => {
  const editor = makeEditor([p('first block'), p('second block'), p('')]);

  it('gives the whole text of the block holding the cursor', () => {
    const at = posOf(editor, 'second') + 2;
    expect(describeBlockAt(editor.state.doc, at)).toMatchObject({
      kind: 'inline',
      text: 'second block',
    });
  });

  it('gives nothing for an empty block', () => {
    const end = editor.state.doc.content.size - 1;
    expect(describeBlockAt(editor.state.doc, end)).toBeNull();
  });
});

describe('proposalContent', () => {
  const inline = { kind: 'inline', from: 1, to: 5, text: 'x', hasMarks: false } as const;
  const blocks = { kind: 'blocks', from: 0, to: 10, text: 'x', hasMarks: false } as const;

  it('takes only the text for a passage inside a block, dropping a heading or list marker', () => {
    const out = proposalContent(inline, '# A heading')!;
    expect(out).toEqual([{ type: 'text', text: 'A heading' }]);
    expect(proposalContent(inline, '- one item')).toEqual([{ type: 'text', text: 'one item' }]);
  });

  it('joins several paragraphs into one passage', () => {
    const out = proposalContent(inline, 'First.\n\nSecond.')!;
    expect(out.map((n) => n.text).join('')).toBe('First. Second.');
  });

  it('keeps bold in a passage', () => {
    const out = proposalContent(inline, 'plain **strong**')!;
    expect(out.some((n) => n.marks?.[0]?.type === 'bold')).toBe(true);
  });

  it('takes the blocks as they are for whole blocks', () => {
    const out = proposalContent(blocks, '# Title\n\nBody')!;
    expect(out.map((n) => n.type)).toEqual(['heading', 'paragraph']);
  });

  it('gives nothing for an empty answer', () => {
    expect(proposalContent(inline, '   ')).toBeNull();
    expect(proposalContent(blocks, '')).toBeNull();
  });
});

describe('replaceRangeWithContent', () => {
  it('replaces only the range, as one undo step, and emits no update', () => {
    const editor = makeEditor([p('Led a team of six engineers.'), p('Other paragraph.')]);
    const onUpdate = vi.fn();
    editor.on('update', onUpdate);
    const from = posOf(editor, 'team of six');
    const to = from + 'team of six'.length;

    const ok = replaceRangeWithContent(editor, from, to, [{ type: 'text', text: 'squad of 6' }]);

    expect(ok).toBe(true);
    expect(editor.getText()).toBe('Led a squad of 6 engineers.\n\nOther paragraph.');
    expect(onUpdate).not.toHaveBeenCalled();

    editor.commands.undo();
    expect(editor.getText()).toBe('Led a team of six engineers.\n\nOther paragraph.');
  });

  it('replaces whole blocks with blocks and undoes them in one step', () => {
    const editor = makeEditor([p('one'), p('two'), p('three')]);
    const range = describeRange(
      editor.state.doc,
      posOf(editor, 'two'),
      posOf(editor, 'three') + 5,
    )!;
    replaceRangeWithContent(editor, range.from, range.to, [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Merged' }] },
    ]);
    // StarterKit keeps an empty paragraph after a final heading.
    expect(editor.getText().trim()).toBe('one\n\nMerged');
    editor.commands.undo();
    expect(editor.getText()).toBe('one\n\ntwo\n\nthree');
  });

  it('reads a range the same way it was described', () => {
    const editor = makeEditor([p('alpha'), p('beta')]);
    const range = describeDocument(editor.state.doc)!;
    expect(rangeText(editor.state.doc, range.from, range.to)).toBe(range.text);
  });
});
