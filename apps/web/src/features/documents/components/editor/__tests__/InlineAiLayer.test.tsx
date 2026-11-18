import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { InlineAiLayer } from '#/features/documents/components/editor/InlineAiLayer';
import { ASK_AI_EVENT } from '#/features/documents/lib/editor/askAi';

// The controller's state lives in a store the mocked hook subscribes to, so a
// change re-renders the layer as the real hook's setState does.
const { ai, store, useInlineAiMock } = vi.hoisted(() => {
  const handlers = {
    run: vi.fn(),
    openAsk: vi.fn(),
    setAskScope: vi.fn(),
    accept: vi.fn(),
    dismiss: vi.fn(),
  };
  const listeners = new Set<() => void>();
  let snapshot = { ...handlers, state: { phase: 'idle' } as { phase: string } };
  const store = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: () => snapshot,
    setState: (state: { phase: string }) => {
      snapshot = { ...handlers, state };
      listeners.forEach((listener) => listener());
    },
  };
  return { ai: handlers, store, useInlineAiMock: vi.fn() };
});

vi.mock('#/features/documents/hooks/useInlineAi', async () => {
  const { useSyncExternalStore } = await import('react');
  useInlineAiMock.mockImplementation(() => useSyncExternalStore(store.subscribe, store.get));
  return { useInlineAi: useInlineAiMock };
});

vi.mock('#/features/documents/components/editor/DocumentEditorBubbleMenu', () => ({
  DocumentEditorBubbleMenu: ({
    editable,
    ai: menuAi,
  }: {
    editable: boolean;
    ai: { run: (request: unknown, range: unknown) => void };
  }) => (
    <button
      type="button"
      data-testid="bubble"
      data-editable={String(editable)}
      onClick={() => menuAi.run({ kind: 'polish' }, { from: 1 })}
    />
  ),
}));

vi.mock('#/features/documents/components/editor/SelectionProposalCard', () => ({
  SelectionProposalCard: ({ onRun }: { onRun: (request: unknown, range: unknown) => void }) => (
    <button
      type="button"
      data-testid="card"
      onClick={() => onRun({ kind: 'custom' }, { from: 2 })}
    />
  ),
}));

function Harness({
  editable,
  onEditor,
}: {
  editable: boolean;
  onEditor: (editor: Editor) => void;
}) {
  const editor = useEditor({ extensions: [StarterKit], content: '<p>hello</p>' });
  if (!editor) return null;
  onEditor(editor);
  return (
    <div>
      <EditorContent editor={editor} />
      <InlineAiLayer
        editor={editor}
        editable={editable}
        draftId="draft-1"
        setEditable={() => {}}
        flush={() => {}}
      />
    </div>
  );
}

function setup(editable = true) {
  let editor!: Editor;
  render(
    <Harness
      editable={editable}
      onEditor={(e) => {
        editor = e;
      }}
    />,
  );
  return () => editor;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.setState({ phase: 'idle' });
});

describe('InlineAiLayer', () => {
  it('builds the controller for its draft', () => {
    setup();

    expect(useInlineAiMock).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: 'draft-1', translate: expect.any(Function) }),
    );
  });

  it('opens the ask card when the slash menu announces Ask AI', () => {
    const getEditor = setup();

    act(() => {
      getEditor().view.dom.dispatchEvent(new Event(ASK_AI_EVENT));
    });

    expect(ai.openAsk).toHaveBeenCalledOnce();
  });

  it('stops listening for Ask AI once unmounted', () => {
    let editor!: Editor;
    const { unmount } = render(
      <Harness
        editable
        onEditor={(e) => {
          editor = e;
        }}
      />,
    );
    const dom = editor.view.dom;
    unmount();

    dom.dispatchEvent(new Event(ASK_AI_EVENT));

    expect(ai.openAsk).not.toHaveBeenCalled();
  });

  it('lets the formatting menu work while the editor is editable and no request is out', () => {
    setup(true);

    expect(screen.getByTestId('bubble')).toHaveAttribute('data-editable', 'true');
  });

  it('keeps the formatting menu away while a request or its answer is on screen', () => {
    store.setState({ phase: 'loading' });
    setup(true);

    expect(screen.getByTestId('bubble')).toHaveAttribute('data-editable', 'false');
  });

  it('keeps the formatting menu away while the editor is read-only', () => {
    setup(false);

    expect(screen.getByTestId('bubble')).toHaveAttribute('data-editable', 'false');
  });

  it('follows the controller and the editable flag as they change', () => {
    const onEditor = () => {};
    const { rerender } = render(<Harness editable onEditor={onEditor} />);
    rerender(<Harness editable onEditor={onEditor} />);
    expect(screen.getByTestId('bubble')).toHaveAttribute('data-editable', 'true');

    act(() => store.setState({ phase: 'proposal' }));
    expect(screen.getByTestId('bubble')).toHaveAttribute('data-editable', 'false');

    act(() => store.setState({ phase: 'idle' }));
    expect(screen.getByTestId('bubble')).toHaveAttribute('data-editable', 'true');
    rerender(<Harness editable={false} onEditor={onEditor} />);
    expect(screen.getByTestId('bubble')).toHaveAttribute('data-editable', 'false');

    rerender(<Harness editable onEditor={onEditor} />);
    expect(screen.getByTestId('bubble')).toHaveAttribute('data-editable', 'true');
  });

  it('runs a request from the menu and from the card through the one controller', () => {
    setup();

    act(() => screen.getByTestId('bubble').click());
    expect(ai.run).toHaveBeenLastCalledWith({ kind: 'polish' }, { from: 1 });

    act(() => screen.getByTestId('card').click());
    expect(ai.run).toHaveBeenLastCalledWith({ kind: 'custom' }, { from: 2 });
  });
});
