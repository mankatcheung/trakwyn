import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

interface EditorUpdateConfig {
  onUpdate: (args: { editor: { getJSON: () => unknown; getText: () => string } }) => void;
}

const { mockEditor, useEditorMock } = vi.hoisted(() => ({
  mockEditor: {} as Record<string, unknown>,
  useEditorMock: vi.fn(),
}));

vi.mock('@tiptap/react', () => ({
  useEditor: useEditorMock,
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock('@tiptap/starter-kit', () => ({ default: { configure: () => ({}) } }));

vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorBubbleMenu',
  () => ({ DocumentEditorBubbleMenu: () => <div data-testid="bubble-menu" /> }),
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
    useEditorMock.mockImplementation((config: EditorUpdateConfig) => {
      capturedConfig = config;
      return mockEditor;
    });
  });

  it('renders nothing while the editor is not ready', () => {
    useEditorMock.mockReturnValue(null);
    const { container } = render(<DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the toolbar and editor content once ready', () => {
    render(<DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} />);

    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('allows only http, https and mailto links', () => {
    render(<DocumentDraftEditor contentJson="{}" onUpdate={vi.fn()} />);

    const config = useEditorMock.mock.calls[0][0] as { extensions: unknown[] };
    expect(config.extensions).toHaveLength(5);
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
