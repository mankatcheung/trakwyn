import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FindAndReplace } from '@tiptap/extension-find-and-replace';
import { DocumentEditorFindBar } from '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorFindBar';
import { FindShortcuts, type FindMode } from '#/lib/editor/findShortcuts';

// jsdom has no layout; ProseMirror asks for rects when it scrolls a match into view.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () => rects;
  Element.prototype.scrollIntoView = vi.fn();
});

const doc = (...texts: string[]) => ({
  type: 'doc',
  content: texts.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

function Harness({
  content,
  editable = true,
  onEditor,
  onUpdate,
}: {
  content: object;
  editable?: boolean;
  onEditor: (editor: Editor) => void;
  onUpdate?: () => void;
}) {
  const [mode, setMode] = useState<FindMode | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      FindAndReplace.configure({ searchDebounceMs: 0 }),
      FindShortcuts.configure({ onOpen: setMode }),
    ],
    content,
    onUpdate,
  });
  if (!editor) return null;
  onEditor(editor);
  return (
    <div>
      <EditorContent editor={editor} />
      {mode && (
        <DocumentEditorFindBar
          editor={editor}
          editable={editable}
          mode={mode}
          onModeChange={setMode}
          onClose={() => setMode(null)}
        />
      )}
    </div>
  );
}

function setup(content: object, opts: { editable?: boolean; onUpdate?: () => void } = {}) {
  let editor!: Editor;
  render(<Harness content={content} onEditor={(e) => (editor = e)} {...opts} />);
  return {
    get editor() {
      return editor;
    },
  };
}

const openFind = (h: { editor: Editor }, key: 'f' | 'h' = 'f') =>
  act(() => {
    fireEvent.keyDown(h.editor.view.dom, { key, ctrlKey: true });
  });

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });

const text = (h: { editor: Editor }) => h.editor.getText({ blockSeparator: '|' });

describe('DocumentEditorFindBar (JEF-580)', () => {
  it('opens on Mod-F inside the editor and on Mod-H with the replace field', () => {
    const h = setup(doc('Acme builds acme parts'));
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    openFind(h, 'f');
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /replace with/i })).not.toBeInTheDocument();
    openFind(h, 'h');
    expect(screen.getByRole('textbox', { name: /replace with/i })).toBeInTheDocument();
  });

  it('also opens the replace field on Mod-Shift-H, which Mac browsers pass to the page (⌘H hides the app)', () => {
    const h = setup(doc('Acme'));
    act(() => {
      fireEvent.keyDown(h.editor.view.dom, {
        key: 'H',
        keyCode: 72,
        ctrlKey: true,
        shiftKey: true,
      });
    });
    expect(screen.getByRole('textbox', { name: /replace with/i })).toBeInTheDocument();
  });

  it('does not take Mod-F when the editor is read-only, so the browser find still works', () => {
    const h = setup(doc('hello'));
    act(() => h.editor.setEditable(false, false));
    const event = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      h.editor.view.dom.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('highlights every match and reports "N of M"', () => {
    const h = setup(doc('Acme builds acme parts', 'at ACME'));
    openFind(h);
    type(/find/i, 'acme');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(h.editor.view.dom.querySelectorAll('.find-and-replace-result')).toHaveLength(3);
  });

  it('steps through matches with Enter and Shift+Enter, wrapping round', () => {
    const h = setup(doc('a b a b a'));
    openFind(h);
    type(/find/i, 'a');
    const input = screen.getByRole('textbox', { name: /find/i });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
  });

  it('says so when nothing matches', () => {
    const h = setup(doc('hello'));
    openFind(h);
    type(/find/i, 'zzz');
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it('honours the case-sensitive and whole-word toggles', () => {
    const h = setup(doc('Cat cat concat'));
    openFind(h);
    type(/find/i, 'cat');
    expect(screen.getByText('1 of 3')).toBeInTheDocument(); // Cat, cat, con-cat
    fireEvent.click(screen.getByRole('button', { name: /match case/i }));
    expect(screen.getByText('1 of 2')).toBeInTheDocument(); // cat, con-cat
    fireEvent.click(screen.getByRole('button', { name: /whole word/i }));
    expect(screen.getByText('1 of 1')).toBeInTheDocument(); // cat
  });

  it('replaces the current match and moves to the next, and the change is saved', () => {
    const onUpdate = vi.fn();
    const h = setup(doc('Acme and Acme'), { onUpdate });
    openFind(h, 'h');
    type(/find/i, 'Acme');
    type(/replace with/i, 'Globex');
    fireEvent.click(screen.getByRole('button', { name: /^replace$/i }));
    expect(text(h)).toBe('Globex and Acme');
    expect(onUpdate).toHaveBeenCalled();
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
  });

  it('replaces all in one undo step', () => {
    const h = setup(doc('Acme one', 'Acme two', 'Acme three'));
    openFind(h, 'h');
    type(/find/i, 'Acme');
    type(/replace with/i, 'Globex');
    fireEvent.click(screen.getByRole('button', { name: /replace all/i }));
    expect(text(h)).toBe('Globex one|Globex two|Globex three');
    act(() => {
      h.editor.commands.undo();
    });
    expect(text(h)).toBe('Acme one|Acme two|Acme three');
  });

  it('is disabled while the AI helper has the editor read-only', () => {
    const h = setup(doc('Acme'), { editable: false });
    openFind(h, 'h');
    expect(screen.getByRole('textbox', { name: /find/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /replace all/i })).toBeDisabled();
  });

  it('closes on Escape, clears the highlights and hands focus back to the editor', async () => {
    const h = setup(doc('Acme'));
    openFind(h);
    type(/find/i, 'Acme');
    // jsdom does not focus a contenteditable, so check the hand-back by the call.
    const focus = vi.spyOn(h.editor.view, 'focus');
    fireEvent.keyDown(screen.getByRole('textbox', { name: /find/i }), { key: 'Escape' });
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(h.editor.view.dom.querySelectorAll('.find-and-replace-result')).toHaveLength(0);
    await waitFor(() => expect(focus).toHaveBeenCalled());
  });
});
