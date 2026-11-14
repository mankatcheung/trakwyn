import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { JSONContent } from '@tiptap/core';
import { createNodeRenderer, HIGHLIGHT_COLOR } from '#src/infrastructure/pdf/renderNode.js';
import { ReactPdfDocumentRenderer } from '#src/infrastructure/pdf/ReactPdfDocumentRenderer.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

const Text = 'Text' as never;
const View = 'View' as never;
const styles = new Proxy({}, { get: (_t, name) => ({ name: String(name) }) }) as never;

function makeLogger(): ILogger {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
}

/** Flattens the element tree to the text a reader would see, with list markers. */
type Props = { children?: ReactNode; style?: { name?: string } & Record<string, unknown> };
const props = (el: ReactElement): Props => el.props as Props;

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(props(node as ReactElement).children);
}

function find(
  node: ReactNode,
  predicate: (el: ReactElement) => boolean,
  found: ReactElement[] = [],
) {
  if (Array.isArray(node)) node.forEach((n) => find(n, predicate, found));
  else if (node && typeof node === 'object') {
    const el = node as ReactElement;
    if (predicate(el)) found.push(el);
    find(props(el).children, predicate, found);
  }
  return found;
}

const p = (text: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text, marks }],
});
const item = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content });

function render(doc: JSONContent, logger?: ILogger): ReactNode {
  return createNodeRenderer({ pdf: { Text, View }, styles, logger })(doc);
}

describe('createNodeRenderer', () => {
  it('numbers an ordered list from its start attribute and bullets a bullet list', () => {
    const out = render({
      type: 'doc',
      content: [
        { type: 'orderedList', attrs: { start: 3 }, content: [item(p('a')), item(p('b'))] },
        { type: 'bulletList', content: [item(p('c'))] },
      ],
    });
    expect(textOf(out)).toBe('3.a4.b•c');
  });

  it('numbers from 1 when start is missing', () => {
    const out = render({
      type: 'doc',
      content: [{ type: 'orderedList', content: [item(p('a')), item(p('b'))] }],
    });
    expect(textOf(out)).toBe('1.a2.b');
  });

  it('indents a nested list with its own markers', () => {
    const nested = { type: 'orderedList', content: [item(p('inner'))] };
    const out = render({
      type: 'doc',
      content: [{ type: 'bulletList', content: [item(p('outer'), nested)] }],
    });
    expect(textOf(out)).toBe('•outer1.inner');
    const lists = find(out, (el) => {
      const style = props(el).style;
      return style?.name === 'list' || style?.name === 'nestedList';
    });
    expect(lists.map((el) => props(el).style?.name)).toEqual(['list', 'nestedList']);
  });

  it('renders blockquote, rule and hard break', () => {
    const out = render({
      type: 'doc',
      content: [
        { type: 'blockquote', content: [p('quoted')] },
        { type: 'horizontalRule' },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    });
    expect(textOf(out)).toBe('quoted' + 'a\nb');
    const named = (n: string) => find(out, (el) => props(el).style?.name === n);
    expect(named('blockquote')).toHaveLength(1);
    expect(named('rule')).toHaveLength(1);
  });

  it('styles underline, strike, bold-italic and link marks', () => {
    const out = render({
      type: 'doc',
      content: [
        p('u', [{ type: 'underline' }, { type: 'strike' }]),
        p('bi', [{ type: 'bold' }, { type: 'italic' }]),
        p('site', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
      ],
    });
    const styleOf = (label: string) =>
      find(
        out,
        (el) => props(el).children === label || textOf(props(el).children).startsWith(label),
      )
        .map((el) => props(el).style)
        .find((s) => s && !('name' in s));
    expect(styleOf('u')).toMatchObject({ textDecoration: 'underline line-through' });
    expect(styleOf('bi')).toMatchObject({ fontFamily: 'Helvetica-BoldOblique' });
    expect(styleOf('site')).toMatchObject({ textDecoration: 'underline', color: '#1a56db' });
  });

  it('prints a link target but never uses an unsafe scheme', () => {
    const out = render({
      type: 'doc',
      content: [
        p('site', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
        p('bad', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
      ],
    });
    expect(textOf(out)).toContain('site (https://example.com)');
    expect(textOf(out)).toContain('bad');
    expect(textOf(out)).not.toContain('javascript');
  });

  it('keeps the text of an unknown node and warns once per type', () => {
    const logger = makeLogger();
    const unknown = { type: 'mystery', content: [{ type: 'text', text: 'kept' }] };
    const out = render({ type: 'doc', content: [unknown, unknown] }, logger);
    expect(textOf(out)).toBe('keptkept');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), undefined, {
      event: 'pdf.export.unknown_node',
      nodeType: 'mystery',
    });
  });
});

describe('ReactPdfDocumentRenderer with every node and mark', () => {
  it('produces a PDF without warning for supported nodes', async () => {
    const logger = makeLogger();
    const contentJson = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'orderedList', content: [item(p('one', [{ type: 'bold' }])), item(p('two'))] },
        {
          type: 'bulletList',
          content: [item(p('x'), { type: 'bulletList', content: [item(p('y'))] })],
        },
        { type: 'blockquote', content: [p('q', [{ type: 'strike' }])] },
        { type: 'horizontalRule' },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a', marks: [{ type: 'underline' }] },
            { type: 'hardBreak' },
          ],
        },
      ],
    });
    const pdf = await new ReactPdfDocumentRenderer({ logger }).render({ title: 'T', contentJson });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('createNodeRenderer text alignment (JEF-578)', () => {
  const aligned = (
    type: 'paragraph' | 'heading',
    textAlign: unknown,
    level?: number,
  ): JSONContent => ({
    type,
    attrs: { ...(level ? { level } : {}), ...(textAlign === undefined ? {} : { textAlign }) },
    content: [{ type: 'text', text: 'x' }],
  });
  const styleOf = (node: JSONContent) => {
    const out = render({ type: 'doc', content: [node] });
    const [text] = find(
      out,
      (el) => el.type === 'Text' && textOf(el) === 'x' && props(el).style !== undefined,
    );
    return props(text).style;
  };
  const alignOf = (style: unknown): unknown =>
    (Array.isArray(style) ? style : [style]).find((s) => s && 'textAlign' in s)?.textAlign;

  it.each(['center', 'right'] as const)(
    'prints a %s paragraph and heading aligned',
    (textAlign) => {
      expect(alignOf(styleOf(aligned('paragraph', textAlign)))).toBe(textAlign);
      expect(alignOf(styleOf(aligned('heading', textAlign, 2)))).toBe(textAlign);
    },
  );

  it('keeps the heading level style under the alignment', () => {
    const style = styleOf(aligned('heading', 'center', 1)) as unknown as Array<{ name?: string }>;
    expect(style[0]?.name).toBe('heading1');
  });

  it.each([undefined, null, 'left', 'justify', 'bogus', 7])(
    'leaves a block with alignment %s exactly as it was',
    (textAlign) => {
      const style = styleOf(aligned('paragraph', textAlign)) as { name?: string };
      expect(Array.isArray(style)).toBe(false);
      expect(style.name).toBe('paragraph');
    },
  );

  it('renders every alignment into a real PDF without logging an unknown node', async () => {
    const logger = makeLogger();
    const contentJson = JSON.stringify({
      type: 'doc',
      content: [
        aligned('heading', 'center', 1),
        aligned('paragraph', 'right'),
        aligned('paragraph', 'left'),
      ],
    });
    const pdf = await new ReactPdfDocumentRenderer({ logger }).render({ title: 'T', contentJson });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('createNodeRenderer tables and highlight (JEF-582)', () => {
  const cell = (type: 'tableCell' | 'tableHeader', ...content: JSONContent[]): JSONContent => ({
    type,
    attrs: { colspan: 1, rowspan: 1 },
    content,
  });
  const row = (...cells: JSONContent[]): JSONContent => ({ type: 'tableRow', content: cells });
  const table = (...rows: JSONContent[]): JSONContent => ({ type: 'table', content: rows });
  const named = (out: ReactNode, name: string) => find(out, (el) => props(el).style?.name === name);

  const skills = table(
    row(cell('tableHeader', p('Skill')), cell('tableHeader', p('Years'))),
    row(cell('tableCell', p('TypeScript')), cell('tableCell', p('9'))),
    row(cell('tableCell', p('Go')), cell('tableCell', p('3'))),
  );

  it('prints a table as rows of equal cells and keeps every cell text', () => {
    const out = render({ type: 'doc', content: [skills] });
    expect(named(out, 'table')).toHaveLength(1);
    expect(named(out, 'tableRow')).toHaveLength(3);
    expect(named(out, 'tableHeaderCell')).toHaveLength(2);
    expect(named(out, 'tableCell')).toHaveLength(4);
    expect(textOf(out)).toBe('SkillYearsTypeScript9Go3');
  });

  it('prints header cell text bold and body cell text tight, not as page paragraphs', () => {
    const out = render({ type: 'doc', content: [skills] });
    expect(named(out, 'cellHeaderParagraph')).toHaveLength(2);
    expect(named(out, 'cellParagraph')).toHaveLength(4);
    expect(named(out, 'paragraph')).toHaveLength(0);
  });

  it('keeps a row on one page', () => {
    const out = render({ type: 'doc', content: [skills] });
    for (const r of named(out, 'tableRow')) expect(r.props).toMatchObject({ wrap: false });
  });

  it('goes back to page paragraphs after the table', () => {
    const out = render({ type: 'doc', content: [skills, p('After')] });
    expect(named(out, 'paragraph')).toHaveLength(1);
  });

  it('renders a list and a quote inside a cell without losing their text', () => {
    const out = render({
      type: 'doc',
      content: [
        table(
          row(
            cell(
              'tableCell',
              { type: 'bulletList', content: [item(p('one'))] },
              { type: 'blockquote', content: [p('said')] },
            ),
          ),
        ),
      ],
    });
    expect(textOf(out)).toBe('•onesaid');
  });

  it('paints a highlight as a fixed background, whatever colour the mark claims', () => {
    const out = render({
      type: 'doc',
      content: [p('marked', [{ type: 'highlight', attrs: { color: 'red; evil' } }])],
    });
    const [text] = find(out, (el) => props(el).children === 'marked');
    expect(props(text!).style).toMatchObject({ backgroundColor: HIGHLIGHT_COLOR });
    expect(HIGHLIGHT_COLOR).toBe('#fef08a');
  });

  it('combines highlight with bold', () => {
    const out = render({
      type: 'doc',
      content: [p('x', [{ type: 'bold' }, { type: 'highlight' }])],
    });
    const [text] = find(out, (el) => props(el).children === 'x');
    expect(props(text!).style).toMatchObject({
      fontFamily: 'Helvetica-Bold',
      backgroundColor: HIGHLIGHT_COLOR,
    });
  });

  it('renders a table and a highlight into a real PDF without logging an unknown node', async () => {
    const logger = makeLogger();
    const contentJson = JSON.stringify({
      type: 'doc',
      content: [skills, p('a highlighted phrase', [{ type: 'highlight' }])],
    });
    const pdf = await new ReactPdfDocumentRenderer({ logger }).render({ title: 'T', contentJson });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps a document with no table or highlight exactly as it printed before', () => {
    const out = render({ type: 'doc', content: [p('plain', [{ type: 'bold' }])] });
    expect(named(out, 'paragraph')).toHaveLength(1);
    const [text] = find(out, (el) => props(el).children === 'plain');
    expect(props(text!).style).not.toHaveProperty('backgroundColor');
  });
});
