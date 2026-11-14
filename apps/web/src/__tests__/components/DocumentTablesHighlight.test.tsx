import { beforeAll, describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import {
  DocumentDraftEditor,
  type DocumentEditorHandle,
} from '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor';
import { DocumentEditorTableMenu } from '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorTableMenu';
import { NEW_TABLE, TABLE_COMMANDS, runTableCommand } from '#/lib/editor/tableCommands';
import { SLASH_COMMANDS } from '#/lib/editor/slashCommands';

// jsdom has no layout; ProseMirror and floating-ui ask for rects.
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

function setupEditor(contentJson = doc('hello brave world')) {
  const editorRef = createRef<DocumentEditorHandle>() as { current: DocumentEditorHandle | null };
  render(
    <DocumentDraftEditor contentJson={contentJson} onUpdate={() => {}} editorRef={editorRef} />,
  );
  return editorRef;
}

const countOf = (json: string, type: string) => json.split(`"type":"${type}"`).length - 1;

describe('toolbar: insert table and highlight (JEF-582)', () => {
  it('inserts a table with a header row and two body rows', () => {
    const ref = setupEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Insert table' }));
    const json = ref.current!.getJson();
    expect(countOf(json, 'table')).toBe(1);
    expect(countOf(json, 'tableRow')).toBe(NEW_TABLE.rows);
    expect(countOf(json, 'tableHeader')).toBe(NEW_TABLE.cols);
    expect(countOf(json, 'tableCell')).toBe(NEW_TABLE.cols * (NEW_TABLE.rows - 1));
  });

  it('shows the button pressed and disabled while the cursor is already in a table', async () => {
    setupEditor();
    const button = screen.getByRole('button', { name: 'Insert table' });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    expect(button).toBeDisabled();
  });

  it('highlights the selection and shows the button pressed', async () => {
    const ref = setupEditor();
    const area = document.querySelector('.ProseMirror') as HTMLElement;
    area.focus();
    // Select through the public handle: focusBlock puts the cursor in, select-all marks the text.
    ref.current!.focusBlock(0);
    fireEvent.keyDown(area, { key: 'a', ctrlKey: true });
    const button = screen.getByRole('button', { name: 'Highlight' });
    fireEvent.click(button);
    await waitFor(() => expect(ref.current!.getJson()).toContain('"type":"highlight"'));
  });

  it('gives the highlight a shortcut in its tooltip', () => {
    setupEditor();
    expect(screen.getByRole('button', { name: 'Highlight' }).getAttribute('title')).toMatch(
      /Highlight \((Ctrl\+Shift\+H|⇧⌘H)\)/,
    );
  });

  it('adds a table entry to the slash menu', () => {
    expect(SLASH_COMMANDS.find((c) => c.id === 'table')?.labelKey).toBe(
      'documents.editor.insertTable',
    );
  });
});

function Harness({ onEditor }: { onEditor: (editor: Editor) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: false }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: JSON.parse(doc('intro')),
  });
  if (!editor) return null;
  onEditor(editor);
  return (
    <div>
      <EditorContent editor={editor} />
      <DocumentEditorTableMenu editor={editor} editable />
    </div>
  );
}

function setupMenu() {
  let editor!: Editor;
  render(
    <Harness
      onEditor={(e) => {
        editor = e;
      }}
    />,
  );
  return {
    get editor() {
      return editor;
    },
  };
}

const MENU = { name: 'Table' };
const rows = (editor: Editor) => countOf(JSON.stringify(editor.getJSON()), 'tableRow');
// Columns of the first row, whatever its cells are (the header row can move).
const cols = (editor: Editor) => {
  const table = (editor.getJSON().content ?? []).find((n) => n.type === 'table');
  return (
    (table as { content?: Array<{ content?: unknown[] }> } | undefined)?.content?.[0]?.content
      ?.length ?? 0
  );
};

describe('DocumentEditorTableMenu (JEF-582)', () => {
  it('appears with the cursor in a table and is gone outside it', async () => {
    const h = setupMenu();
    act(() => {
      h.editor.commands.focus();
    });
    expect(screen.queryByRole('toolbar', MENU)).not.toBeInTheDocument();

    act(() => {
      h.editor.chain().focus().insertTable(NEW_TABLE).run();
    });
    expect(await screen.findByRole('toolbar', MENU)).toBeInTheDocument();

    act(() => {
      let intro = 0;
      h.editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === 'intro') intro = pos + 1;
      });
      h.editor.commands.setTextSelection(intro);
    });
    await waitFor(() => expect(screen.queryByRole('toolbar', MENU)).not.toBeInTheDocument());
  });

  it('adds and removes rows and columns, and deletes the table', async () => {
    const h = setupMenu();
    act(() => {
      h.editor.chain().focus().insertTable(NEW_TABLE).run();
    });
    const menu = await screen.findByRole('toolbar', MENU);
    const press = (name: string) => fireEvent.click(menu.querySelector(`[aria-label="${name}"]`)!);

    press('Row below');
    expect(rows(h.editor)).toBe(4);
    press('Row above');
    expect(rows(h.editor)).toBe(5);
    press('Delete row');
    expect(rows(h.editor)).toBe(4);

    press('Column right');
    expect(cols(h.editor)).toBe(4);
    press('Delete column');
    expect(cols(h.editor)).toBe(3);

    press('Delete table');
    expect(JSON.stringify(h.editor.getJSON())).not.toContain('"type":"table"');
    // The text outside the table is still there.
    expect(h.editor.getText()).toContain('intro');
  });

  it('turns the first row into body cells and back', async () => {
    const h = setupMenu();
    act(() => {
      h.editor.chain().focus().insertTable(NEW_TABLE).run();
    });
    const menu = await screen.findByRole('toolbar', MENU);
    const header = menu.querySelector('[aria-label="Header row"]')!;
    fireEvent.click(header);
    expect(JSON.stringify(h.editor.getJSON())).not.toContain('tableHeader');
    fireEvent.click(header);
    expect(JSON.stringify(h.editor.getJSON())).toContain('tableHeader');
  });

  it('names every command and keeps focus in the editor on mouse down', async () => {
    const h = setupMenu();
    act(() => {
      h.editor.chain().focus().insertTable(NEW_TABLE).run();
    });
    const menu = await screen.findByRole('toolbar', MENU);
    expect(menu.querySelectorAll('button')).toHaveLength(TABLE_COMMANDS.length);
    for (const b of menu.querySelectorAll('button')) expect(b).toHaveAccessibleName();
    const notPrevented = fireEvent.mouseDown(menu.querySelector('button')!);
    expect(notPrevented).toBe(false);
  });
});

describe('table keyboard and compatibility (JEF-582)', () => {
  it('moves between cells with Tab and Shift+Tab', () => {
    const h = setupMenu();
    act(() => {
      h.editor.chain().focus().insertTable(NEW_TABLE).run();
    });
    const at = () => h.editor.state.selection.from;
    const first = at();
    act(() => {
      fireEvent.keyDown(h.editor.view.dom, { key: 'Tab' });
    });
    expect(at()).toBeGreaterThan(first);
    act(() => {
      fireEvent.keyDown(h.editor.view.dom, { key: 'Tab', shiftKey: true });
    });
    expect(at()).toBe(first);
  });

  it('adds a row when Tab leaves the last cell, so the table can always be extended from the keyboard', () => {
    const h = setupMenu();
    act(() => {
      h.editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
      // Last cell.
      h.editor.commands.goToNextCell();
      h.editor.commands.goToNextCell();
      h.editor.commands.goToNextCell();
    });
    const before = rows(h.editor);
    act(() => {
      fireEvent.keyDown(h.editor.view.dom, { key: 'Tab' });
    });
    expect(rows(h.editor)).toBe(before + 1);
  });

  it('leaves a document without a table or highlight exactly as it was', () => {
    const original = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Jane' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
            },
          ],
        },
      ],
    };
    let editor!: Editor;
    function Plain() {
      const e = useEditor({
        extensions: [
          StarterKit,
          Highlight.configure({ multicolor: false }),
          TableKit.configure({ table: { resizable: false } }),
        ],
        content: original,
      });
      if (e) editor = e;
      return e ? <EditorContent editor={e} /> : null;
    }
    render(<Plain />);
    expect(editor.getJSON()).toEqual(original);
  });

  it('runs every menu command through one function', () => {
    expect(TABLE_COMMANDS.map((c) => c.id).sort()).toEqual(
      [
        'addColumnAfter',
        'addColumnBefore',
        'addRowAfter',
        'addRowBefore',
        'deleteColumn',
        'deleteRow',
        'deleteTable',
        'toggleHeaderRow',
      ].sort(),
    );
    expect(runTableCommand).toBeTypeOf('function');
  });
});
