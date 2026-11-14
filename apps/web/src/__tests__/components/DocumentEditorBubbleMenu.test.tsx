import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { DocumentEditorBubbleMenu } from '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorBubbleMenu';
import { isAllowedLinkUri } from '#/lib/editorLinks';
import { ALLOWED_LINK_PROTOCOLS } from '#/lib/editorLinks';

// jsdom has no layout; ProseMirror and floating-ui ask for rects.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () => rects;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const CONTENT = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello brave world' }] }],
};

function Harness({
  editable = true,
  onEditor,
}: {
  editable?: boolean;
  onEditor: (editor: Editor) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          protocols: [...ALLOWED_LINK_PROTOCOLS],
          isAllowedUri: (url) => isAllowedLinkUri(url),
        },
      }),
    ],
    content: CONTENT,
  });
  if (!editor) return null;
  onEditor(editor);
  return (
    <div>
      <EditorContent editor={editor} />
      <DocumentEditorBubbleMenu editor={editor} editable={editable} />
    </div>
  );
}

function setup(editable = true) {
  let editor!: Editor;
  const view = render(
    <Harness
      editable={editable}
      onEditor={(e) => {
        editor = e;
      }}
    />,
  );
  return {
    get editor() {
      return editor;
    },
    ...view,
  };
}

const MENU = { name: 'Format selection' };

function select(editor: Editor, from: number, to: number) {
  act(() => {
    editor.commands.focus();
    editor.commands.setTextSelection({ from, to });
  });
}

describe('DocumentEditorBubbleMenu (JEF-574)', () => {
  it('is not shown until text is selected, and goes away when the selection collapses', async () => {
    const h = setup();
    expect(screen.queryByRole('toolbar', MENU)).not.toBeInTheDocument();

    select(h.editor, 1, 6);
    expect(await screen.findByRole('toolbar', MENU)).toBeInTheDocument();

    act(() => {
      h.editor.commands.setTextSelection(3);
    });
    await waitFor(() => expect(screen.queryByRole('toolbar', MENU)).not.toBeInTheDocument());
  });

  it('offers bold, italic, underline, highlight, link and clear formatting with names and shortcut tooltips', async () => {
    const h = setup();
    select(h.editor, 1, 6);
    const menu = await screen.findByRole('toolbar', MENU);

    for (const name of ['Bold', 'Italic', 'Underline', 'Highlight', 'Link', 'Clear formatting']) {
      const button = Array.from(menu.querySelectorAll('button')).find(
        (b) => b.getAttribute('aria-label') === name,
      );
      expect(button, name).toBeDefined();
      expect(button).toHaveAttribute('title');
    }
    expect(menu.querySelector('[aria-label="Bold"]')!.getAttribute('title')).toMatch(
      /Bold \((Ctrl\+B|⌘B)\)/,
    );
    expect(menu.querySelectorAll('button')).toHaveLength(6);
  });

  it('applies a mark and shows it as pressed', async () => {
    const h = setup();
    select(h.editor, 1, 6);
    const menu = await screen.findByRole('toolbar', MENU);
    const bold = menu.querySelector('[aria-label="Bold"]') as HTMLElement;
    expect(bold).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(bold);
    expect(JSON.stringify(h.editor.getJSON())).toContain('"type":"bold"');
    await waitFor(() => expect(bold).toHaveAttribute('aria-pressed', 'true'));
  });

  it('clears every mark on the selection', async () => {
    const h = setup();
    select(h.editor, 1, 6);
    act(() => {
      h.editor.chain().toggleBold().toggleItalic().run();
    });
    const menu = await screen.findByRole('toolbar', MENU);
    expect(JSON.stringify(h.editor.getJSON())).toContain('bold');

    fireEvent.click(menu.querySelector('[aria-label="Clear formatting"]')!);
    const json = JSON.stringify(h.editor.getJSON());
    expect(json).not.toContain('bold');
    expect(json).not.toContain('italic');
  });

  it('refuses a javascript: link and applies an https one', async () => {
    const h = setup();
    select(h.editor, 1, 6);
    const menu = await screen.findByRole('toolbar', MENU);
    fireEvent.click(menu.querySelector('[aria-label="Link"]')!);

    const input = screen.getByRole('textbox', { name: 'Link address' });
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(JSON.stringify(h.editor.getJSON())).not.toContain('javascript');

    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(JSON.stringify(h.editor.getJSON())).toContain('"href":"https://example.com"');
  });

  it('is not shown while the editor is read-only', async () => {
    const h = setup(false);
    select(h.editor, 1, 6);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('toolbar', MENU)).not.toBeInTheDocument();
  });

  it('is not shown on a touch device, which has its own selection menu', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('coarse'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const h = setup();
    select(h.editor, 1, 6);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('toolbar', MENU)).not.toBeInTheDocument();
  });

  it('closes on Escape, keeps the selection, and returns for a new selection', async () => {
    const h = setup();
    select(h.editor, 1, 6);
    await screen.findByRole('toolbar', MENU);

    fireEvent.keyDown(h.editor.view.dom, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('toolbar', MENU)).not.toBeInTheDocument());
    expect(h.editor.state.selection.from).toBe(1);
    expect(h.editor.state.selection.to).toBe(6);

    select(h.editor, 7, 12);
    expect(await screen.findByRole('toolbar', MENU)).toBeInTheDocument();
  });
});
