import { beforeAll, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  DocumentDraftEditor,
  type DocumentEditorHandle,
} from '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor';
import { isAllowedLinkUri, normalizeLinkInput } from '#/lib/editorLinks';

// jsdom has no layout; ProseMirror asks for rects when it scrolls the selection into view.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () => rects;
});

const doc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

function setup(text = 'hello world') {
  const editorRef = createRef<DocumentEditorHandle>() as { current: DocumentEditorHandle | null };
  const onUpdate = vi.fn();
  const view = render(
    <DocumentDraftEditor contentJson={doc(text)} onUpdate={onUpdate} editorRef={editorRef} />,
  );
  return { editorRef, onUpdate, ...view };
}

/** Selects the whole document so a mark applies to its text. */
function selectAll() {
  const area = document.querySelector('.ProseMirror') as HTMLElement;
  area.focus();
  return area;
}

describe('DocumentEditorToolbar (JEF-573)', () => {
  it('gives every button an accessible name and a tooltip', () => {
    setup();
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(11);
    for (const button of buttons) {
      expect(button).toHaveAccessibleName();
      expect(button).toHaveAttribute('title');
    }
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Text style' })).toBeInTheDocument();
  });

  it('shows the keyboard shortcut in the tooltip', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('title')).toMatch(
      /Bold \((Ctrl\+B|⌘B)\)/,
    );
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('title')).toMatch(/Undo \(/);
  });

  it('reports toggle state with aria-pressed and leaves plain actions without it', () => {
    setup();
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(bold);
    expect(bold).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Divider' })).not.toHaveAttribute('aria-pressed');
  });

  it('changes the block type from the dropdown', () => {
    const { editorRef } = setup();
    selectAll();
    fireEvent.change(screen.getByRole('combobox', { name: 'Text style' }), {
      target: { value: 'h2' },
    });
    expect(editorRef.current!.getJson()).toContain('"type":"heading"');
    expect(screen.getByRole('combobox', { name: 'Text style' })).toHaveValue('h2');
  });

  it('adds a quote and a divider', () => {
    const { editorRef } = setup();
    selectAll();
    fireEvent.click(screen.getByRole('button', { name: 'Quote' }));
    fireEvent.click(screen.getByRole('button', { name: 'Divider' }));
    const json = editorRef.current!.getJson();
    expect(json).toContain('blockquote');
    expect(json).toContain('horizontalRule');
  });

  describe('link', () => {
    it('refuses a javascript: address and says why', () => {
      const { editorRef } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Link address' }), {
        target: { value: 'javascript:alert(1)' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/http or https/);
      expect(editorRef.current!.getJson()).not.toContain('javascript');
    });

    it('applies an https address and prefills it when the cursor is on the link', () => {
      const { editorRef } = setup();
      const area = selectAll();
      act(() => {
        // select the paragraph text so the link has a range to wrap
        const range = document.createRange();
        range.selectNodeContents(area.querySelector('p')!);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Link address' }), {
        target: { value: 'example.com/jobs' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      expect(editorRef.current!.getJson()).toContain('"href":"https://example.com/jobs"');
    });
  });

  describe('read-only (AI helper has the editor)', () => {
    it('disables every control, and enables them again afterwards', () => {
      const { editorRef } = setup();
      act(() => editorRef.current!.setEditable(false));
      for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
      expect(screen.getByRole('combobox', { name: 'Text style' })).toBeDisabled();

      act(() => editorRef.current!.setEditable(true));
      expect(screen.getByRole('button', { name: 'Bold' })).toBeEnabled();
    });
  });

  describe('undo and redo', () => {
    it('start disabled, and undo an AI replace', () => {
      const { editorRef } = setup('original');
      const undo = screen.getByRole('button', { name: 'Undo' });
      expect(undo).toBeDisabled();

      act(() =>
        editorRef.current!.replaceContent([
          { type: 'paragraph', content: [{ type: 'text', text: 'rewritten' }] },
        ]),
      );
      expect(editorRef.current!.getText()).toBe('rewritten');
      expect(undo).toBeEnabled();

      fireEvent.click(undo);
      expect(editorRef.current!.getText()).toBe('original');
      expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
      expect(editorRef.current!.getText()).toBe('rewritten');
    });
  });

  it('keeps the toolbar visible while the page scrolls', () => {
    setup();
    const bar = screen.getByRole('toolbar').parentElement!;
    // top-0, not an offset for the mobile header: <main> already pads for it.
    expect(bar.className).toContain('sticky');
    expect(bar.className).toContain('top-0');
    expect(bar.className).not.toMatch(/top-14/);
  });
});

describe('text alignment (JEF-578)', () => {
  const twoParagraphs = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ],
  });
  const render3 = () => {
    const editorRef = createRef<DocumentEditorHandle>() as { current: DocumentEditorHandle | null };
    render(
      <DocumentDraftEditor contentJson={twoParagraphs} onUpdate={vi.fn()} editorRef={editorRef} />,
    );
    return editorRef;
  };
  const aligns = (editorRef: { current: DocumentEditorHandle | null }) =>
    (
      JSON.parse(editorRef.current!.getJson()).content as Array<{ attrs?: { textAlign?: string } }>
    ).map((block) => block.attrs?.textAlign ?? null);
  const selectBlocks = () => {
    const area = selectAll();
    act(() => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(area);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
  };

  it('offers left, centre and right with names, shortcuts and a pressed state', () => {
    render3();
    for (const [name, shortcut] of [
      ['Align left', /\(Ctrl\+Shift\+L|⌘⇧L\)/],
      ['Align center', /\(Ctrl\+Shift\+E|⌘⇧E\)/],
      ['Align right', /\(Ctrl\+Shift\+R|⌘⇧R\)/],
    ] as const) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('title')).toMatch(shortcut);
      expect(button).toHaveAttribute('aria-pressed');
    }
    // Nothing is set on an existing document, which reads as left.
    expect(screen.getByRole('button', { name: 'Align left' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Align center' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('does not offer justify', () => {
    render3();
    expect(screen.queryByRole('button', { name: /justif/i })).not.toBeInTheDocument();
  });

  it('centres every selected block and shows the active alignment', () => {
    const editorRef = render3();
    selectBlocks();
    fireEvent.click(screen.getByRole('button', { name: 'Align center' }));
    expect(aligns(editorRef)).toEqual(['center', 'center', 'center']);
    expect(screen.getByRole('button', { name: 'Align center' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Align left' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('right-aligns, then returns to left by clearing the setting', () => {
    const editorRef = render3();
    selectBlocks();
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    expect(aligns(editorRef)).toEqual(['right', 'right', 'right']);
    fireEvent.click(screen.getByRole('button', { name: 'Align left' }));
    expect(aligns(editorRef)).toEqual([null, null, null]);
  });

  it('leaves a document nobody aligned without any alignment', () => {
    const editorRef = render3();
    expect(aligns(editorRef)).toEqual([null, null, null]);
  });
});

describe('link policy', () => {
  it.each(['https://a.com', 'http://a.com', 'mailto:me@a.com', 'HTTPS://A.COM'])(
    'allows %s',
    (uri) => expect(isAllowedLinkUri(uri)).toBe(true),
  );
  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///etc/passwd',
    'ftp://a.com',
    'a.com',
  ])('refuses %s as a final address', (uri) => expect(isAllowedLinkUri(uri)).toBe(false));
  it('adds https to a bare address and rejects anything unsafe or empty', () => {
    expect(normalizeLinkInput(' example.com/x ')).toBe('https://example.com/x');
    expect(normalizeLinkInput('mailto:me@a.com')).toBe('mailto:me@a.com');
    expect(normalizeLinkInput('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkInput('JaVaScRiPt:alert(1)')).toBeNull();
    expect(normalizeLinkInput('data:text/html;base64,AAAA')).toBeNull();
    expect(normalizeLinkInput('')).toBeNull();
    expect(normalizeLinkInput('two words')).toBeNull();
  });
});
