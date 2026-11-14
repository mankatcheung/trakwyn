import { beforeAll, describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import type { SaveStatus } from '#/lib/editor/saveState';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CharacterCount } from '@tiptap/extensions';
import { DocumentEditorStatusBar } from '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorStatusBar';
import {
  DocumentDraftEditor,
  type DocumentEditorHandle,
} from '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor';
import { countWords } from '#/lib/editor/countWords';

// jsdom has no layout; ProseMirror asks for rects when it scrolls the selection into view.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () => rects;
});

const paragraphs = (...texts: string[]) => ({
  type: 'doc',
  content: texts.map((text) =>
    text === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text }] },
  ),
});

function Harness({
  content,
  onEditor,
  saveStatus,
  language,
}: {
  content: object;
  onEditor: (e: Editor) => void;
  saveStatus?: SaveStatus;
  language?: ComponentProps<typeof DocumentEditorStatusBar>['language'];
}) {
  const editor = useEditor({
    extensions: [StarterKit, CharacterCount.configure({ wordCounter: countWords })],
    content,
  });
  if (!editor) return null;
  onEditor(editor);
  return (
    <div>
      <EditorContent editor={editor} />
      <DocumentEditorStatusBar editor={editor} saveStatus={saveStatus} language={language} />
    </div>
  );
}

function setup(content: object) {
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

const bar = () => screen.getByTestId('editor-status-bar');

describe('DocumentEditorStatusBar (JEF-576)', () => {
  it('shows words and characters of the draft', () => {
    setup(paragraphs('hello brave world'));
    expect(bar()).toHaveTextContent('3 words·17 characters');
  });

  it('reads 0 for an empty draft and uses the singular for one', () => {
    const empty = setup(paragraphs(''));
    expect(bar()).toHaveTextContent('0 words·0 characters');
    act(() => {
      empty.editor.commands.setContent(paragraphs('Hello'));
    });
    expect(bar()).toHaveTextContent('1 word·5 characters');
  });

  it('counts paragraphs as separate words and leaves newlines out of the characters', () => {
    setup(paragraphs('end', 'start'));
    expect(bar()).toHaveTextContent('2 words·8 characters');
  });

  it('updates as the document changes', async () => {
    const h = setup(paragraphs('one'));
    expect(bar()).toHaveTextContent('1 word');
    act(() => {
      h.editor.chain().focus('end').insertContent(' two three').run();
    });
    await waitFor(() => expect(bar()).toHaveTextContent('3 words·13 characters'));
  });

  it('formats large numbers for the reader', () => {
    setup(paragraphs(Array.from({ length: 1234 }, () => 'w').join(' ')));
    expect(bar()).toHaveTextContent('1,234 words');
  });

  it('counts the selection against the whole draft', async () => {
    const h = setup(paragraphs('hello brave world'));
    // "brave" sits at positions 7 to 12 (position 1 is the start of the paragraph).
    act(() => {
      h.editor.commands.focus();
      h.editor.commands.setTextSelection({ from: 7, to: 12 });
    });
    await waitFor(() => expect(bar()).toHaveTextContent('1 of 3 words·5 of 17 characters'));

    act(() => {
      h.editor.commands.setTextSelection(3);
    });
    await waitFor(() => expect(bar()).toHaveTextContent('3 words·17 characters'));
  });

  it('counts a selection across paragraphs', async () => {
    const h = setup(paragraphs('one two', 'three'));
    act(() => {
      h.editor.commands.focus();
      h.editor.commands.selectAll();
    });
    await waitFor(() => expect(bar()).toHaveTextContent('3 of 3 words'));
  });

  it('keeps a fixed height so the numbers never move the page', () => {
    setup(paragraphs('hello'));
    expect(bar().className).toContain('h-8');
    expect(bar().className).toContain('tabular-nums');
  });

  it('has text colours for both light and dark mode', () => {
    setup(paragraphs('hello'));
    expect(bar().className).toMatch(/text-gray-600/);
    expect(bar().className).toMatch(/dark:text-gray-400/);
    expect(bar().className).toMatch(/dark:bg-gray-800/);
  });
});

describe('DocumentDraftEditor: placeholder and AI changes (JEF-576)', () => {
  function renderEditor(props: {
    contentJson: string;
    draftType?: 'resume' | 'cover_letter';
    onUpdate?: (json: string, text: string) => void;
  }) {
    const editorRef = createRef<DocumentEditorHandle>() as { current: DocumentEditorHandle | null };
    render(
      <DocumentDraftEditor
        contentJson={props.contentJson}
        onUpdate={props.onUpdate ?? vi.fn()}
        editorRef={editorRef}
        draftType={props.draftType}
      />,
    );
    return editorRef;
  }
  const emptyDoc = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
  const hint = () =>
    document.querySelector('.ProseMirror p.is-editor-empty')?.getAttribute('data-placeholder');

  it('shows a resume hint in an empty resume', () => {
    renderEditor({ contentJson: emptyDoc, draftType: 'resume' });
    expect(hint()).toMatch(/^Start your resume here/);
  });

  it('shows a cover letter hint in an empty cover letter', () => {
    renderEditor({ contentJson: emptyDoc, draftType: 'cover_letter' });
    expect(hint()).toMatch(/^Start your cover letter here/);
  });

  it('falls back to a general hint when the type is not given', () => {
    renderEditor({ contentJson: emptyDoc });
    expect(hint()).toMatch(/^Start typing/);
  });

  it('shows no hint once the draft has text, and keeps it out of the saved content', async () => {
    const ref = renderEditor({ contentJson: emptyDoc, draftType: 'resume' });
    expect(hint()).toBeTruthy();

    act(() =>
      ref.current!.appendContent([{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }]),
    );
    await waitFor(() => expect(hint()).toBeFalsy());
    // The hint is a decoration: it is in neither the saved JSON nor the text the PDF is built from.
    expect(ref.current!.getJson()).not.toContain('Start your resume');
    expect(ref.current!.getText()).not.toContain('Start your resume');
  });

  it('never puts the hint in the JSON of an empty draft either', () => {
    const ref = renderEditor({ contentJson: emptyDoc, draftType: 'cover_letter' });
    expect(ref.current!.getJson()).not.toContain('Start your cover letter');
    expect(ref.current!.getText()).toBe('');
  });

  it('shows the status bar under the editor and counts an AI replace and append', async () => {
    const ref = renderEditor({ contentJson: JSON.stringify(paragraphs('one two')) });
    const status = within(screen.getByTestId('editor-status-bar'));
    expect(status.getByText('2 words')).toBeInTheDocument();

    act(() =>
      ref.current!.replaceContent([
        { type: 'paragraph', content: [{ type: 'text', text: 'a b c d e' }] },
      ]),
    );
    await waitFor(() => expect(status.getByText('5 words')).toBeInTheDocument());

    act(() =>
      ref.current!.appendContent([{ type: 'paragraph', content: [{ type: 'text', text: 'f g' }] }]),
    );
    await waitFor(() => expect(status.getByText('7 words')).toBeInTheDocument());
  });
});

describe('DocumentEditorStatusBar — save status (JEF-577)', () => {
  const renderWith = (saveStatus: SaveStatus) =>
    render(<Harness content={paragraphs('hi')} onEditor={() => {}} saveStatus={saveStatus} />);

  it.each([
    ['saved', 'Saved'],
    ['saving', 'Saving…'],
    ['dirty', 'Unsaved changes'],
  ] as const)('labels the %s state without a Retry or an announcement', (state, label) => {
    renderWith({ state, onRetry: vi.fn() });
    expect(screen.getByTestId('save-status')).toHaveAttribute('data-state', state);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it("announces a failure with the API's message and offers Retry", async () => {
    const onRetry = vi.fn();
    renderWith({ state: 'error', errorMessage: 'Session expired', onRetry });

    expect(screen.getByRole('status')).toHaveTextContent("Couldn't save. Session expired");
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows counts only when no save status is given', () => {
    render(<Harness content={paragraphs('hi')} onEditor={() => {}} />);
    expect(screen.queryByTestId('save-status')).not.toBeInTheDocument();
  });
});

describe('DocumentEditorStatusBar — language beside save status (JEF-577, JEF-579)', () => {
  it('shows the language picker and the save state together on one line', () => {
    render(
      <Harness
        content={paragraphs('hi')}
        onEditor={() => {}}
        saveStatus={{ state: 'saved', onRetry: vi.fn() }}
        language={{ value: 'en-GB', onChange: vi.fn() }}
      />,
    );
    const line = screen.getByTestId('editor-status-bar');
    expect(within(line).getByRole('combobox', { name: 'Document language' })).toHaveValue('en-GB');
    expect(within(line).getByTestId('save-status')).toHaveAttribute('data-state', 'saved');
  });
});
