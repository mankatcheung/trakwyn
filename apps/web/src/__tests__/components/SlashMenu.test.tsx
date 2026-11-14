import { beforeAll, describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SlashMenu } from '#/routes/_authenticated/applications/$applicationId/-components/SlashMenu';
import { SlashCommand } from '#/lib/editor/SlashCommandExtension';
import { createSlashMenuController } from '#/lib/editor/slashMenuController';
import { SLASH_COMMANDS, filterSlashCommands } from '#/lib/editor/slashCommands';
import en from '#/i18n/en.json';

// jsdom has no layout; ProseMirror and floating-ui ask for rects.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () => rects;
});

const labelOf = (item: { labelKey: string }) => (en as Record<string, string>)[item.labelKey];

function Harness({ onEditor, content }: { onEditor: (e: Editor) => void; content?: object }) {
  const controller = createSlashMenuController();
  const editor = useEditor({
    extensions: [
      StarterKit,
      SlashCommand.configure({
        controller,
        filter: (query) => filterSlashCommands(SLASH_COMMANDS, query, labelOf),
      }),
    ],
    content,
  });
  if (!editor) return null;
  onEditor(editor);
  return (
    <div>
      <EditorContent editor={editor} />
      <SlashMenu editor={editor} controller={controller} />
    </div>
  );
}

function setup(content?: object) {
  let editor!: Editor;
  render(
    <Harness
      content={content}
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

const type = (editor: Editor, text: string) =>
  act(() => {
    editor.chain().focus().insertContent(text).run();
  });
const key = (editor: Editor, name: string) =>
  act(() => {
    fireEvent.keyDown(editor.view.dom, { key: name });
  });
const json = (editor: Editor) => JSON.stringify(editor.getJSON());
const options = () => screen.queryAllByRole('option');

describe('SlashMenu (JEF-575)', () => {
  it('opens on a slash in an empty block, as a labelled listbox of every block', async () => {
    const h = setup();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    type(h.editor, '/');
    expect(await screen.findByRole('listbox', { name: 'Insert block' })).toBeInTheDocument();
    expect(options().map((o) => o.textContent)).toEqual([
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bulleted list',
      'Numbered list',
      'Quote',
      'Divider',
      'Ask AI',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('8 blocks available');
  });

  it('filters as the reader types', async () => {
    const h = setup();
    type(h.editor, '/head');
    await waitFor(() => expect(options()).toHaveLength(3));
    type(h.editor, 'ing 2');
    // A space ends the query, so the menu closes rather than guess.
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('inserts the highlighted block on Enter and removes the /query text', async () => {
    const h = setup();
    type(h.editor, '/head');
    await waitFor(() => expect(options()).toHaveLength(3));

    key(h.editor, 'ArrowDown');
    await waitFor(() => expect(options()[1]).toHaveAttribute('aria-selected', 'true'));
    key(h.editor, 'Enter');

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(h.editor.getJSON().content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 2 },
    });
    expect(json(h.editor)).not.toContain('/head');
    // The heading is empty; the paragraph after it is StarterKit's trailing node.
    expect(h.editor.getJSON().content?.[0].content).toBeUndefined();
  });

  it('wraps around with the arrow keys', async () => {
    const h = setup();
    type(h.editor, '/');
    await waitFor(() => expect(options()).toHaveLength(8));
    key(h.editor, 'ArrowUp');
    await waitFor(() => expect(options()[7]).toHaveAttribute('aria-selected', 'true'));
    key(h.editor, 'ArrowDown');
    await waitFor(() => expect(options()[0]).toHaveAttribute('aria-selected', 'true'));
  });

  it('inserts a block when an option is clicked', async () => {
    const h = setup();
    type(h.editor, '/quo');
    fireEvent.click(await screen.findByRole('option', { name: 'Quote' }));
    expect(json(h.editor)).toContain('blockquote');
    expect(json(h.editor)).not.toContain('/quo');
  });

  it('inserts a numbered list and a divider', async () => {
    const h = setup();
    type(h.editor, '/num');
    fireEvent.click(await screen.findByRole('option', { name: 'Numbered list' }));
    expect(json(h.editor)).toContain('orderedList');

    const second = setup();
    type(second.editor, '/div');
    fireEvent.click(await screen.findByRole('option', { name: 'Divider' }));
    expect(json(second.editor)).toContain('horizontalRule');
  });

  it('points the editor at the highlighted option for screen readers', async () => {
    const h = setup();
    type(h.editor, '/');
    const list = await screen.findByRole('listbox');
    const dom = h.editor.view.dom;

    expect(dom).toHaveAttribute('aria-expanded', 'true');
    expect(dom).toHaveAttribute('aria-controls', list.id);
    expect(dom).toHaveAttribute('aria-activedescendant', options()[0].id);

    key(h.editor, 'ArrowDown');
    await waitFor(() => expect(dom).toHaveAttribute('aria-activedescendant', options()[1].id));

    key(h.editor, 'Escape');
    await waitFor(() => expect(dom).not.toHaveAttribute('aria-expanded'));
    expect(dom).not.toHaveAttribute('aria-activedescendant');
  });

  it('closes on Escape and leaves what was typed', async () => {
    const h = setup();
    type(h.editor, '/head');
    await waitFor(() => expect(options()).toHaveLength(3));

    key(h.editor, 'Escape');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(h.editor.getText()).toBe('/head');
    expect(json(h.editor)).not.toContain('heading');
  });

  it('shows nothing for a query that matches no block, and Enter keeps its normal meaning', async () => {
    const h = setup();
    type(h.editor, '/zzz');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(h.editor.getText()).toBe('/zzz');
    expect(json(h.editor)).not.toMatch(/heading|blockquote|orderedList|horizontalRule/);
  });

  it('is not offered while the editor is read-only', async () => {
    const h = setup();
    act(() => h.editor.setEditable(false, false));
    type(h.editor, '/');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('is not offered inside a list item', async () => {
    const h = setup({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
        },
      ],
    });
    act(() => {
      h.editor.commands.focus('end');
    });
    type(h.editor, '/');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('is not offered in the middle of a sentence', async () => {
    const h = setup({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'see' }] }],
    });
    act(() => {
      h.editor.commands.focus('end');
    });
    type(h.editor, ' /head');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('is not offered when a slash is typed in front of existing text', async () => {
    const h = setup({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'existing' }] }],
    });
    act(() => {
      h.editor.commands.focus('start');
    });
    type(h.editor, '/');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
