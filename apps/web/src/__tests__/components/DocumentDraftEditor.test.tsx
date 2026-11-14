import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

interface EditorUpdateConfig {
  onUpdate: (args: { editor: { getJSON: () => unknown; getText: () => string } }) => void;
}

const { mockEditor, useEditorMock } = vi.hoisted(() => ({
  mockEditor: {} as Record<string, unknown>,
  useEditorMock: vi.fn(),
}));

vi.mock('@tiptap/react', () => ({
  useEditor: useEditorMock,
  EditorContent: ({
    className,
    style,
    'data-testid': testId,
  }: {
    className?: string;
    style?: React.CSSProperties;
    'data-testid'?: string;
  }) => <div data-testid={testId ?? 'editor-content'} className={className} style={style} />,
}));

vi.mock('@tiptap/starter-kit', () => ({ default: { configure: () => ({}) } }));

// The find bar has its own tests against a real editor (DocumentEditorFindBar.test.tsx).
vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorFindBar',
  () => ({
    DocumentEditorFindBar: ({ mode }: { mode: string }) => <div data-testid="find-bar">{mode}</div>,
  }),
);

vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorBubbleMenu',
  () => ({ DocumentEditorBubbleMenu: () => <div data-testid="bubble-menu" /> }),
);

vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorTableMenu',
  () => ({ DocumentEditorTableMenu: () => <div data-testid="table-menu" /> }),
);

vi.mock('#/routes/_authenticated/applications/$applicationId/-components/SlashMenu', () => ({
  SlashMenu: () => <div data-testid="slash-menu" />,
}));

vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorStatusBar',
  () => ({ DocumentEditorStatusBar: () => <div data-testid="status-bar" /> }),
);

vi.mock('#/lib/editor/SlashCommandExtension', () => ({
  SlashCommand: { configure: () => ({}) },
}));

// The toolbar has its own tests against a real editor (DocumentEditorToolbar.test.tsx).
vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorToolbar',
  () => ({ DocumentEditorToolbar: () => <div data-testid="toolbar" /> }),
);

import {
  DocumentDraftEditor,
  type DocumentEditorHandle,
} from '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor';

describe('DocumentDraftEditor', () => {
  let capturedConfig: EditorUpdateConfig | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEditor.setOptions = vi.fn();
    useEditorMock.mockImplementation((config: EditorUpdateConfig) => {
      capturedConfig = config;
      return mockEditor;
    });
  });

  it("draws the content on the PDF's page inside a themed surround (JEF-581)", () => {
    render(<DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} />);
    const page = screen.getByTestId('document-page');
    expect(page.className).toContain('document-page');
    expect(page.className).not.toContain('prose');
    expect(page.style.getPropertyValue('--doc-width')).toBe('595.28pt');
    expect(page.style.getPropertyValue('--doc-padding')).toBe('40pt');
    // The page is white in dark mode too; only the surround follows the theme.
    expect(page.className).not.toContain('dark:');
    expect(screen.getByTestId('document-page-surround').className).toContain('dark:bg-gray-900');
  });

  it('asks for spellcheck and sets the document language on the editing area (JEF-579)', () => {
    render(
      <DocumentDraftEditor
        contentJson="{}"
        onUpdate={vi.fn()}
        language={{ value: 'fr', onChange: vi.fn() }}
      />,
    );
    expect(
      (capturedConfig as unknown as { editorProps: { attributes: object } }).editorProps.attributes,
    ).toEqual({ spellcheck: 'true', lang: 'fr' });
    // The editor is built once, so the language is also pushed into the live view.
    expect(mockEditor.setOptions).toHaveBeenCalledWith({
      editorProps: { attributes: { spellcheck: 'true', lang: 'fr' } },
    });
  });

  it('renders nothing while the editor is not ready', () => {
    useEditorMock.mockReturnValue(null);
    const { container } = render(<DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the toolbar and editor content once ready', () => {
    render(<DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} />);

    expect(screen.getByTestId('document-page')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('allows only http, https and mailto links', () => {
    render(<DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} />);

    const config = useEditorMock.mock.calls[0][0] as { extensions: unknown[] };
    // StarterKit (links), placeholder, count, slash menu (JEF-574..576), find and replace and its shortcuts (JEF-580), text align (JEF-578), highlight and tables (JEF-582).
    expect(config.extensions).toHaveLength(9);
  });

  it('falls back to undefined initial content for invalid JSON', () => {
    render(<DocumentDraftEditor contentJson="not json" onUpdate={vi.fn()} />);

    expect(useEditorMock).toHaveBeenCalledWith(expect.objectContaining({ content: undefined }));
  });

  it('debounces onUpdate calls from the editor', () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn();
    render(<DocumentDraftEditor contentJson="{}" onUpdate={onUpdate} />);

    const fakeEditor = {
      getJSON: () => ({ type: 'doc' }),
      getText: () => 'hello world',
    };
    capturedConfig?.onUpdate({ editor: fakeEditor });

    expect(onUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);

    expect(onUpdate).toHaveBeenCalledWith(JSON.stringify({ type: 'doc' }), 'hello world');
    vi.useRealTimers();
  });

  describe('editorRef handle (JEF-506)', () => {
    const nodes = [{ type: 'paragraph' }];
    const setup = () => {
      const commands = { setContent: vi.fn(), insertContentAt: vi.fn() };
      Object.assign(mockEditor, {
        commands,
        getText: () => 'now',
        getJSON: () => ({ type: 'doc' }),
        state: { doc: { content: { size: 42 } } },
      });
      const editorRef = { current: null as DocumentEditorHandle | null };
      const onUpdate = vi.fn();
      render(<DocumentDraftEditor contentJson="{}" onUpdate={onUpdate} editorRef={editorRef} />);
      return { commands, editorRef, onUpdate };
    };

    it('reads the live text and document', () => {
      const { editorRef } = setup();
      expect(editorRef.current!.getText()).toBe('now');
      expect(editorRef.current!.getJson()).toBe('{"type":"doc"}');
    });

    it('replaces the document without emitting an update', () => {
      const { editorRef, commands } = setup();
      editorRef.current!.replaceContent(nodes);
      expect(commands.setContent).toHaveBeenCalledWith(
        { type: 'doc', content: nodes },
        { emitUpdate: false },
      );
    });

    it('toggles editing without emitting an update', () => {
      const { editorRef } = setup();
      const setEditable = vi.fn();
      Object.assign(mockEditor, { setEditable });
      editorRef.current!.setEditable(false);
      expect(setEditable).toHaveBeenCalledWith(false, false);
    });

    it('reports the live text on every change, ahead of the save debounce', () => {
      const onTextChange = vi.fn();
      render(
        <DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} onTextChange={onTextChange} />,
      );
      capturedConfig?.onUpdate({ editor: { getJSON: () => ({}), getText: () => 'typed' } });
      expect(onTextChange).toHaveBeenCalledWith('typed');
    });

    it('reports the live document JSON on every change, for the resume checks (JEF-585)', () => {
      const onJsonChange = vi.fn();
      render(
        <DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} onJsonChange={onJsonChange} />,
      );
      capturedConfig?.onUpdate({
        editor: { getJSON: () => ({ type: 'doc' }), getText: () => 'typed' },
      });
      expect(onJsonChange).toHaveBeenCalledWith('{"type":"doc"}');
    });

    it('puts the cursor at the start of the block with the given index', () => {
      const { editorRef } = setup();
      const run = vi.fn();
      const setTextSelection = vi.fn(() => ({ scrollIntoView: () => ({ run }) }));
      const focus = vi.fn(() => ({ setTextSelection }));
      Object.assign(mockEditor, {
        chain: () => ({ focus }),
        state: {
          doc: {
            content: { size: 42 },
            // Three blocks, starting at 0, 10 and 25.
            forEach: (fn: (node: unknown, offset: number, index: number) => void) =>
              [0, 10, 25].forEach((offset, i) => fn({}, offset, i)),
          },
        },
      });
      editorRef.current!.focusBlock(2);
      expect(setTextSelection).toHaveBeenCalledWith(26);
      expect(run).toHaveBeenCalled();
    });

    it('opens the find bar from the editor shortcut, in the requested mode, and closes it again (JEF-580)', () => {
      render(<DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} />);
      expect(screen.queryByTestId('find-bar')).not.toBeInTheDocument();
      const shortcuts = useEditorMock.mock.calls[0][0].extensions.find(
        (e: { options?: { onOpen?: unknown } }) => typeof e?.options?.onOpen === 'function',
      );
      expect(shortcuts).toBeDefined();
      act(() => shortcuts.options.onOpen('replace'));
      expect(screen.getByTestId('find-bar')).toHaveTextContent('replace');
    });

    it('appends after the last block', () => {
      const { editorRef, commands } = setup();
      editorRef.current!.appendContent(nodes);
      expect(commands.insertContentAt).toHaveBeenCalledWith(42, nodes);
    });

    it('sends an edit still waiting out the debounce before replacing, so it cannot land later', () => {
      vi.useFakeTimers();
      const { editorRef, onUpdate } = setup();
      capturedConfig?.onUpdate({
        editor: { getJSON: () => ({ type: 'doc' }), getText: () => 'x' },
      });
      editorRef.current!.replaceContent(nodes);
      expect(onUpdate).toHaveBeenCalledWith('{"type":"doc"}', 'x');
      vi.useRealTimers();
    });
  });
});
