import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { JSONContent } from '@tiptap/core';
import { createNodeRenderer } from '#src/infrastructure/pdf/renderNode.js';
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
