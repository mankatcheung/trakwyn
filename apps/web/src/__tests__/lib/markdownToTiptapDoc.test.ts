import { describe, it, expect } from 'vitest';
import { markdownToTiptapDoc, markdownToTiptapNodes } from '#/lib/markdownToTiptapDoc';

describe('markdownToTiptapNodes', () => {
  it('turns headings into heading nodes with their level', () => {
    expect(markdownToTiptapNodes('# Jane Doe\n\n## Experience')).toEqual([
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Jane Doe' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Experience' }] },
    ]);
  });

  it('keeps consecutive lines in one paragraph as hard breaks, and splits on a blank line', () => {
    const nodes = markdownToTiptapNodes('Dear team,\nI am writing.\n\nThanks');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Dear team,' },
        { type: 'hardBreak' },
        { type: 'text', text: 'I am writing.' },
      ],
    });
  });

  it('keeps an address block on separate lines', () => {
    const [node] = markdownToTiptapNodes('Jane Doe\n1 High Street\nLondon');
    expect(node!.content!.map((n) => n.type)).toEqual([
      'text',
      'hardBreak',
      'text',
      'hardBreak',
      'text',
    ]);
  });

  it.each([
    'See github.com/foo_bar_baz for more',
    'Write to john_doe_x@mail.com today',
    'Ran my_script_v2 and then_some_',
  ])('does not read underscores inside a word as emphasis: %s', (text) => {
    expect(markdownToTiptapNodes(text)).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text }] },
    ]);
  });

  it('still reads underscore emphasis at word boundaries', () => {
    const [node] = markdownToTiptapNodes('a _big_ and __bold__ day');
    expect(node!.content).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'big', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' day' },
    ]);
  });

  it('groups bullets into one list, and starts an ordered list when the marker changes', () => {
    const nodes = markdownToTiptapNodes('- one\n- two\n1. first\n2. second');
    expect(nodes.map((n) => n.type)).toEqual(['bulletList', 'orderedList']);
    expect(nodes[0]!.content).toHaveLength(2);
    expect(nodes[1]!.content![1]).toEqual({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }],
    });
  });

  it('accepts * and + bullets', () => {
    expect(markdownToTiptapNodes('* a\n+ b')[0]!.content).toHaveLength(2);
  });

  it('marks bold and italic spans', () => {
    const [node] = markdownToTiptapNodes('Led **five** engineers and *shipped* it');
    expect(node!.content).toEqual([
      { type: 'text', text: 'Led ' },
      { type: 'text', text: 'five', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' engineers and ' },
      { type: 'text', text: 'shipped', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' it' },
    ]);
  });

  it('never emits an empty text node, which ProseMirror rejects', () => {
    const json = JSON.stringify(markdownToTiptapNodes('# \n\n**a**\n- \n'));
    expect(json).not.toContain('"text":""');
  });

  it('returns nothing for an empty string and drops horizontal rules', () => {
    expect(markdownToTiptapNodes('')).toEqual([]);
    expect(markdownToTiptapNodes('---')).toEqual([]);
  });
});

describe('markdownToTiptapDoc', () => {
  it('wraps the nodes in a doc and gives the editor-style plain text', () => {
    const { contentJson, plainText } = markdownToTiptapDoc('# Title\n\nBody **text**\n\n- a\n- b');
    expect(JSON.parse(contentJson).type).toBe('doc');
    expect(plainText).toBe('Title\n\nBody text\n\na\n\nb');
  });

  it('gives one empty paragraph for empty input', () => {
    const { contentJson, plainText } = markdownToTiptapDoc('  ');
    expect(JSON.parse(contentJson).content).toEqual([{ type: 'paragraph' }]);
    expect(plainText).toBe('');
  });
});
