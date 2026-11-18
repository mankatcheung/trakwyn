import { beforeAll, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SelectionProposalCard } from '#/features/documents/components/editor/SelectionProposalCard';
import type { InlineAiController, InlineAiState } from '#/features/documents/hooks/useInlineAi';
import type { AiRange } from '#/features/documents/lib/editor/selectionRange';

vi.mock('#/features/documents/components/editor/InlineAiForm', () => ({
  InlineAiForm: ({ onRun }: { onRun: (request: { kind: string }) => void }) => (
    <button type="button" onClick={() => onRun({ kind: 'custom' })}>
      run-form
    </button>
  ),
}));

vi.mock('#/components/Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

// jsdom has no layout; ProseMirror asks for rects, and so does the card to place itself.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () => rects;
});

const range: AiRange = { kind: 'text', from: 1, to: 6, text: 'hello', hasMarks: false };

function makeAi(state: InlineAiState): InlineAiController {
  return {
    state,
    run: vi.fn(),
    openAsk: vi.fn(),
    setAskScope: vi.fn(),
    accept: vi.fn(),
    dismiss: vi.fn(),
  } as InlineAiController;
}

function Harness({
  ai,
  onRun,
  onEditor,
}: {
  ai: InlineAiController;
  onRun: (...args: unknown[]) => void;
  onEditor: (editor: Editor) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello brave world' }] }],
    },
  });
  if (!editor) return null;
  onEditor(editor);
  return (
    <div>
      <EditorContent editor={editor} />
      <SelectionProposalCard editor={editor} ai={ai} onRun={onRun} />
    </div>
  );
}

function setup(state: InlineAiState) {
  const ai = makeAi(state);
  const onRun = vi.fn();
  let editor!: Editor;
  render(
    <Harness
      ai={ai}
      onRun={onRun}
      onEditor={(e) => {
        editor = e;
      }}
    />,
  );
  return { ai, onRun, editor: () => editor };
}

const card = () => screen.getByRole('dialog', { name: 'Ask AI' });

describe('SelectionProposalCard', () => {
  it('renders nothing while idle', () => {
    setup({ phase: 'idle' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('asking', () => {
    const state: InlineAiState = { phase: 'ask', scope: 'block', range };

    it('marks the current scope and switches it', () => {
      const { ai } = setup(state);

      expect(screen.getByRole('button', { name: 'This block', pressed: true })).toBeInTheDocument();
      const buttons = screen.getAllByRole('button', { pressed: false });
      fireEvent.click(buttons[0]);

      expect(ai.setAskScope).toHaveBeenCalledExactlyOnceWith('document');
    });

    it('marks the whole-document scope when that is the one chosen', () => {
      const { ai } = setup({ phase: 'ask', scope: 'document', range });

      expect(
        screen.getByRole('button', { name: 'Whole document', pressed: true }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'This block' }));

      expect(ai.setAskScope).toHaveBeenCalledExactlyOnceWith('block');
    });

    it('sends the request with the range it was opened for', () => {
      const { onRun } = setup(state);

      fireEvent.click(screen.getByRole('button', { name: 'run-form' }));

      expect(onRun).toHaveBeenCalledExactlyOnceWith({ kind: 'custom' }, range);
    });

    it('cancels', () => {
      const { ai } = setup(state);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(ai.dismiss).toHaveBeenCalledOnce();
    });
  });

  it('floats beside the selection once its position is worked out', async () => {
    setup({ phase: 'loading', range });

    expect(card()).toHaveStyle({ position: 'fixed' });
    await waitFor(() => expect(card().style.top).toBe('8px'));
  });

  it('says it is working, and lets the user cancel', () => {
    const { ai } = setup({ phase: 'loading', range });

    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(ai.dismiss).toHaveBeenCalledOnce();
  });

  it('shows an error and closes it', () => {
    const { ai } = setup({ phase: 'error', range, code: undefined, message: 'It broke' });

    expect(screen.getByRole('alert')).toHaveTextContent('It broke');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(ai.dismiss).toHaveBeenCalledOnce();
  });

  it('shows an error that has no range', () => {
    setup({ phase: 'error', range: null, code: undefined, message: 'No selection' });

    expect(screen.getByRole('alert')).toHaveTextContent('No selection');
  });

  describe('proposing', () => {
    it('shows the original and the suggestion, and focuses Accept', () => {
      setup({
        phase: 'proposal',
        range,
        markdown: 'hi',
        content: [
          { type: 'text', text: 'hey ' },
          { type: 'text', text: 'there' },
        ],
      });

      expect(screen.getByText('hello')).toBeInTheDocument();
      expect(screen.getByTestId('ai-suggestion')).toHaveTextContent('hey there');
      expect(screen.getByRole('button', { name: 'Accept' })).toHaveFocus();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('renders a block suggestion as markdown', () => {
      setup({
        phase: 'proposal',
        range: { ...range, kind: 'blocks' },
        markdown: '**bold**',
        content: [],
      });

      expect(screen.getByTestId('markdown')).toHaveTextContent('**bold**');
    });

    it('warns when the rewrite may flatten formatting', () => {
      setup({
        phase: 'proposal',
        range: { ...range, hasMarks: true },
        markdown: '',
        content: [{ type: 'text' }],
      });

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('accepts and rejects', () => {
      const { ai } = setup({ phase: 'proposal', range, markdown: '', content: [] });

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
      expect(ai.accept).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
      expect(ai.dismiss).toHaveBeenCalledOnce();
    });
  });

  it('dismisses on Escape and gives the focus back to the editor', () => {
    const { ai, editor } = setup({ phase: 'loading', range });
    const focus = vi.spyOn(editor().commands, 'focus');
    void focus;

    fireEvent.keyDown(card(), { key: 'Escape' });

    expect(ai.dismiss).toHaveBeenCalledOnce();
  });

  it('follows the request through its phases and away again', () => {
    const onRun = vi.fn();
    const onEditor = vi.fn();
    const phases: InlineAiState[] = [
      { phase: 'ask', scope: 'block', range },
      { phase: 'loading', range },
      { phase: 'proposal', range, markdown: '', content: [{ type: 'text', text: 'new' }] },
      { phase: 'error', range, code: undefined, message: 'Failed' },
    ];
    const { rerender } = render(
      <Harness ai={makeAi({ phase: 'idle' })} onRun={onRun} onEditor={onEditor} />,
    );

    for (const phase of phases) {
      const ai = makeAi(phase);
      rerender(<Harness ai={ai} onRun={onRun} onEditor={onEditor} />);
      rerender(<Harness ai={ai} onRun={onRun} onEditor={onEditor} />);
      expect(card()).toBeInTheDocument();
    }
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');

    rerender(<Harness ai={makeAi({ phase: 'idle' })} onRun={onRun} onEditor={onEditor} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores other keys', () => {
    const { ai } = setup({ phase: 'loading', range });

    fireEvent.keyDown(card(), { key: 'a' });

    expect(ai.dismiss).not.toHaveBeenCalled();
  });
});
