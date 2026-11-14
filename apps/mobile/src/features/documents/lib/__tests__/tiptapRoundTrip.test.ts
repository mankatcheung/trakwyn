import { markdownToTiptapDoc, markdownToTiptapNodes } from '../markdownToTiptapDoc';
import { draftToMarkdown, tiptapToMarkdown } from '../tiptapToMarkdown';
import type { TiptapNode } from '../tiptapTypes';

const text = (
  value: string,
  ...marks: (string | { type: string; attrs: Record<string, unknown> })[]
): TiptapNode => ({
  type: 'text',
  text: value,
  ...(marks.length > 0
    ? { marks: marks.map((m) => (typeof m === 'string' ? { type: m } : m)) }
    : {}),
});
const para = (...content: TiptapNode[]): TiptapNode => ({ type: 'paragraph', content });
const doc = (...content: TiptapNode[]): TiptapNode => ({ type: 'doc', content });
const list = (type: string, ...items: string[]): TiptapNode => ({
  type,
  content: items.map((item) => ({ type: 'listItem', content: [para(text(item))] })),
});

// The same fixtures a web-side test can import: a document is supported when it
// survives JSON -> Markdown -> JSON unchanged.
const FIXTURES: Record<string, TiptapNode> = {
  heading: doc({ type: 'heading', attrs: { level: 2 }, content: [text('Experience')] }),
  paragraphs: doc(para(text('First.')), para(text('Second.'))),
  hardBreak: doc(para(text('Line one'), { type: 'hardBreak' }, text('Line two'))),
  bold: doc(para(text('a '), text('bold', 'bold'), text(' word'))),
  italic: doc(para(text('an '), text('italic', 'italic'), text(' word'))),
  strike: doc(para(text('gone', 'strike'))),
  boldItalic: doc(para(text('both', 'bold', 'italic'))),
  link: doc(
    para(text('see '), text('my site', { type: 'link', attrs: { href: 'https://example.com' } })),
  ),
  boldLink: doc(
    para(text('site', { type: 'link', attrs: { href: 'https://example.com/a' } }, 'bold')),
  ),
  bullets: doc(list('bulletList', 'One', 'Two')),
  ordered: doc(list('orderedList', 'One', 'Two')),
  quote: doc({ type: 'blockquote', content: [para(text('Quoted')), para(text('More'))] }),
  rule: doc(para(text('Above')), { type: 'horizontalRule' }, para(text('Below'))),
  mixed: doc(
    { type: 'heading', attrs: { level: 1 }, content: [text('Jane')] },
    para(text('Engineer', 'italic')),
    list('bulletList', 'Built things'),
    para(text('Thanks')),
  ),
  literalMarkers: doc(
    para(text('2 * 3 and *not italic* and snake_case and _x_')),
    para(text('# not a heading')),
    para(text('- not a bullet')),
    para(text('1. not a list')),
    para(text('> not a quote')),
    para(text('[not](https://example.com) a link')),
  ),
};

describe('tiptap <-> markdown round trip', () => {
  it.each(Object.entries(FIXTURES))('%s survives unchanged', (_name, fixture) => {
    const { markdown, lossy } = tiptapToMarkdown(fixture);
    expect(lossy).toBe(false);
    const back = JSON.parse(markdownToTiptapDoc(markdown).contentJson);
    expect(back).toEqual(fixture);
  });

  it('writes the expected Markdown', () => {
    expect(tiptapToMarkdown(FIXTURES.mixed!).markdown).toBe(
      '# Jane\n\n*Engineer*\n\n- Built things\n\nThanks',
    );
    expect(tiptapToMarkdown(FIXTURES.boldItalic!).markdown).toBe('**_both_**');
  });

  it('moves spaces outside the markers', () => {
    const { markdown } = tiptapToMarkdown(doc(para(text(' bold ', 'bold'))));
    expect(markdown).toBe(' **bold** ');
  });

  it.each([
    ['alignment', doc({ type: 'paragraph', attrs: { textAlign: 'center' }, content: [text('x')] })],
    ['highlight', doc(para(text('x', 'highlight')))],
    ['underline', doc(para(text('x', 'underline')))],
    ['a table', doc({ type: 'table', content: [] })],
    [
      'a nested list',
      doc({
        type: 'bulletList',
        content: [{ type: 'listItem', content: [para(text('a')), list('bulletList', 'b')] }],
      }),
    ],
  ])('flags %s as lossy', (_name, fixture) => {
    expect(tiptapToMarkdown(fixture).lossy).toBe(true);
  });

  it('treats left alignment as plain', () => {
    const left = doc({ type: 'paragraph', attrs: { textAlign: 'left' }, content: [text('x')] });
    expect(tiptapToMarkdown(left).lossy).toBe(false);
  });

  it('still shows the text of an unsupported block', () => {
    const table = doc({
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('cell'))] }] },
      ],
    });
    expect(tiptapToMarkdown(table).markdown).toBe('cell');
  });
});

describe('draftToMarkdown', () => {
  it('uses contentJson when it parses', () => {
    const result = draftToMarkdown({
      contentJson: JSON.stringify(FIXTURES.bold),
      plainText: 'a bold word',
    });
    expect(result).toEqual({ markdown: 'a **bold** word', lossy: false });
  });

  it('falls back to plainText for unreadable JSON', () => {
    expect(draftToMarkdown({ contentJson: 'nope', plainText: 'Hello' })).toEqual({
      markdown: 'Hello',
      lossy: false,
    });
  });

  it('gives an empty editor for a blank document', () => {
    expect(
      draftToMarkdown({ contentJson: JSON.stringify(doc({ type: 'paragraph' })), plainText: '' }),
    ).toEqual({ markdown: '', lossy: false });
  });
});

describe('markdownToTiptapDoc', () => {
  it('gives one empty paragraph for empty text', () => {
    const result = markdownToTiptapDoc('');
    expect(JSON.parse(result.contentJson)).toEqual(doc({ type: 'paragraph' }));
    expect(result.plainText).toBe('');
  });

  it('builds formatted content from AI Markdown, not literal markers', () => {
    const nodes = markdownToTiptapNodes('## Skills\n\n- **TypeScript**\n- Go');
    expect(nodes[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(JSON.stringify(nodes)).not.toContain('**');
    expect(nodes[1]!.type).toBe('bulletList');
  });

  it('derives plainText the way the web editor does', () => {
    expect(markdownToTiptapDoc('# Jane\n\n- **One**\n- Two\n\nBye').plainText).toBe(
      'Jane\n\nOne\n\nTwo\n\nBye',
    );
  });

  it('never makes an empty text node', () => {
    expect(markdownToTiptapDoc('a\n\n\n\nb').contentJson).not.toContain('"text":""');
  });

  it('leaves a link with an unsafe URL as text', () => {
    const result = markdownToTiptapDoc('[x](javascript:alert(1))');
    expect(result.contentJson).not.toContain('"link"');
    expect(result.plainText).toBe('[x](javascript:alert(1))');
  });

  it('keeps nested marks', () => {
    const [node] = markdownToTiptapNodes('**bold _and italic_**');
    expect(node!.content).toEqual([text('bold ', 'bold'), text('and italic', 'bold', 'italic')]);
  });
});
