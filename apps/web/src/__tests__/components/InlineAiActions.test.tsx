import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import type { Editor } from '@tiptap/react';

const { mockRequest, creditsState } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  creditsState: {
    needsSetup: false,
    onTrakwynAi: false,
    afford: true,
  },
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockRequest } }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('#/components/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({
    needsSetup: creditsState.needsSetup,
    onTrakwynAi: creditsState.onTrakwynAi,
    canAfford: () => creditsState.afford,
    costOf: () => 2,
    view: null,
    refresh: vi.fn(),
  }),
}));

import {
  DocumentDraftEditor,
  type DocumentEditorHandle,
} from '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor';
import { requestAskAi } from '#/lib/editor/askAi';

// jsdom has no layout; ProseMirror and floating-ui ask for rects.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () => rects;
});

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const CONTENT = JSON.stringify({
  type: 'doc',
  content: [para('Led a team of six engineers.'), para('Shipped twelve releases.')],
});

function setup() {
  const editorRef = createRef<DocumentEditorHandle>() as { current: DocumentEditorHandle | null };
  const onUpdate = vi.fn();
  const onApplied = vi.fn();
  render(
    <DocumentDraftEditor
      contentJson={CONTENT}
      onUpdate={onUpdate}
      editorRef={editorRef}
      inlineAi={{ draftId: 'draft-1', onApplied }}
    />,
  );
  const editor = (document.querySelector('.ProseMirror') as unknown as { editor: Editor }).editor;
  return { editor, editorRef, onUpdate, onApplied };
}

function posOf(editor: Editor, needle: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(needle))
      found = pos + node.text.indexOf(needle);
  });
  return found;
}

function select(editor: Editor, from: number, to: number) {
  act(() => {
    editor.commands.focus();
    editor.commands.setTextSelection({ from, to });
  });
}

const selectTeam = (editor: Editor) => {
  const from = posOf(editor, 'team of six');
  select(editor, from, from + 'team of six'.length);
};

/** Opens the AI part of the formatting menu and returns its action buttons' group. */
async function openAiMenu() {
  const menu = await screen.findByRole('toolbar', { name: 'Format selection' });
  fireEvent.click(within(menu).getByRole('button', { name: 'Ask AI' }));
  return screen.findByRole('group', { name: 'AI actions' });
}

let resolvePolish: (markdown: string) => void = () => {};
let rejectPolish: (error: unknown) => void = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  creditsState.needsSetup = false;
  creditsState.onTrakwynAi = false;
  creditsState.afford = true;
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        resolvePolish = (markdown) => resolve({ polishDocumentDraft: { markdown } });
        rejectPolish = reject;
      }),
  );
});

describe('inline AI actions on a selection (JEF-583)', () => {
  it('shows a loading state, then a proposal; Accept replaces only the selection, in one undo step', async () => {
    const { editor, onApplied, onUpdate } = setup();
    selectTeam(editor);
    const actions = await openAiMenu();

    fireEvent.click(within(actions).getByRole('button', { name: 'Rewrite' }));

    // Loading: one request with the selected text and the preset, editor read-only.
    expect(await screen.findByText('Working on your text…')).toBeInTheDocument();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    const [, variables] = mockRequest.mock.calls[0]!;
    expect(variables).toMatchObject({ draftId: 'draft-1', plainText: 'team of six' });
    expect(variables.instructions).toContain('Rewrite this text');
    expect(editor.isEditable).toBe(false);

    await act(async () => resolvePolish('squad of 6'));

    // Proposal: before and after, nothing applied yet.
    const dialog = await screen.findByRole('dialog', { name: 'Ask AI' });
    expect(within(dialog).getByText('team of six')).toBeInTheDocument();
    expect(within(dialog).getByTestId('ai-suggestion')).toHaveTextContent('squad of 6');
    expect(editor.getText()).toContain('Led a team of six engineers.');
    expect(editor.isEditable).toBe(true);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));

    expect(editor.getText()).toBe('Led a squad of 6 engineers.\n\nShipped twelve releases.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Saved by the page as an AI replacement, not by the editor's own debounce.
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onApplied.mock.calls[0]![1]).toContain('squad of 6');
    expect(onUpdate).not.toHaveBeenCalled();

    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toBe('Led a team of six engineers.\n\nShipped twelve releases.');
  });

  it('Reject leaves the document untouched', async () => {
    const { editor, onApplied } = setup();
    selectTeam(editor);
    fireEvent.click(within(await openAiMenu()).getByRole('button', { name: 'Shorten' }));
    await act(async () => resolvePolish('crew'));

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(editor.getText()).toBe('Led a team of six engineers.\n\nShipped twelve releases.');
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('refuses to apply when the text changed since it was sent', async () => {
    const { editor, onApplied } = setup();
    selectTeam(editor);
    fireEvent.click(within(await openAiMenu()).getByRole('button', { name: 'Fix grammar' }));
    await act(async () => resolvePolish('squad of 6'));
    await screen.findByRole('dialog');

    // An edit inside the range after the request went out.
    act(() => {
      const from = posOf(editor, 'team of six');
      editor.commands.insertContentAt({ from, to: from + 4 }, 'crew');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The text changed while the AI worked',
    );
    expect(editor.getText()).toContain('crew of six');
    expect(onApplied).not.toHaveBeenCalled();
  });

  it.each([
    ['AI_CREDITS_EXHAUSTED', 'You have used all your credits'],
    ['RATE_LIMITED', 'Too many requests'],
  ])('shows a %s failure with the same message as the AI panel', async (code, message) => {
    const { editor } = setup();
    selectTeam(editor);
    fireEvent.click(within(await openAiMenu()).getByRole('button', { name: 'Rewrite' }));
    await act(async () =>
      rejectPolish({ response: { errors: [{ message, extensions: { code } }] } }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(editor.getText()).toContain('team of six');
    expect(editor.isEditable).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores an answer that arrives after Cancel', async () => {
    const { editor } = setup();
    selectTeam(editor);
    fireEvent.click(within(await openAiMenu()).getByRole('button', { name: 'Rewrite' }));
    await screen.findByText('Working on your text…');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => resolvePolish('late'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(editor.isEditable).toBe(true);
    expect(editor.getText()).toContain('team of six');
  });

  it('sends the user’s own ask as a custom instruction', async () => {
    const { editor } = setup();
    selectTeam(editor);
    await openAiMenu();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tell the AI what to change' }), {
      target: { value: 'Make it sound warmer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(mockRequest.mock.calls[0]![1].instructions).toMatch(/Make it sound warmer$/);
  });

  it('turns the AI actions off for a selection that is not one block or whole blocks', async () => {
    const { editor } = setup();
    select(editor, posOf(editor, 'team'), posOf(editor, 'Shipped') + 3);
    const actions = await openAiMenu();

    for (const name of ['Rewrite', 'Shorten', 'Make more formal', 'Fix grammar']) {
      expect(within(actions).getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByText(/select text inside one paragraph/i)).toBeInTheDocument();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('sends a whole-block selection and replaces those blocks', async () => {
    const { editor } = setup();
    select(editor, posOf(editor, 'Led'), posOf(editor, 'Shipped twelve releases.') + 24);
    fireEvent.click(within(await openAiMenu()).getByRole('button', { name: 'Shorten' }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(mockRequest.mock.calls[0]![1].plainText).toBe(
      'Led a team of six engineers.\n\nShipped twelve releases.',
    );
    await act(async () => resolvePolish('Led six engineers.\n\nShipped 12 releases.'));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(editor.getText()).toBe('Led six engineers.\n\nShipped 12 releases.');
  });

  it('warns that formatting inside the selection may be flattened', async () => {
    const editorRef = createRef<DocumentEditorHandle>() as { current: DocumentEditorHandle | null };
    render(
      <DocumentDraftEditor
        contentJson={JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'strong claim', marks: [{ type: 'bold' }] }],
            },
          ],
        })}
        onUpdate={vi.fn()}
        editorRef={editorRef}
        inlineAi={{ draftId: 'draft-1' }}
      />,
    );
    const editor = (document.querySelector('.ProseMirror') as unknown as { editor: Editor }).editor;
    select(editor, 1, 7);
    fireEvent.click(within(await openAiMenu()).getByRole('button', { name: 'Rewrite' }));
    await act(async () => resolvePolish('firm claim'));
    expect(await screen.findByText(/may be flattened/)).toBeInTheDocument();
  });

  it('shows the same set-up prompt as the AI panel when no AI is configured', async () => {
    creditsState.needsSetup = true;
    const { editor } = setup();
    selectTeam(editor);
    const menu = await screen.findByRole('toolbar', { name: 'Format selection' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Ask AI' }));
    expect(await screen.findByRole('link', { name: /set up|add/i })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
    expect(screen.queryByRole('button', { name: 'Rewrite' })).not.toBeInTheDocument();
  });

  it('disables the actions and points to Settings when hosted credits are spent', async () => {
    creditsState.onTrakwynAi = true;
    creditsState.afford = false;
    const { editor } = setup();
    selectTeam(editor);
    const actions = await openAiMenu();
    expect(within(actions).getByRole('button', { name: 'Rewrite' })).toBeDisabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('the slash menu’s Ask AI', () => {
  it('opens a prompt for the block under the cursor, and can widen it to the whole document', async () => {
    const { editor } = setup();
    act(() => {
      editor.commands.focus();
      editor.commands.setTextSelection(posOf(editor, 'Shipped') + 2);
    });
    act(() => requestAskAi(editor));

    const dialog = await screen.findByRole('dialog', { name: 'Ask AI' });
    expect(within(dialog).getByRole('button', { name: 'This block' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Whole document' }));
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Tighten everything' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(mockRequest.mock.calls[0]![1].plainText).toBe(
      'Led a team of six engineers.\n\nShipped twelve releases.',
    );
  });

  it('closes with Escape and gives the editor its focus back', async () => {
    const { editor } = setup();
    act(() => {
      editor.commands.focus();
      editor.commands.setTextSelection(posOf(editor, 'Led') + 1);
    });
    act(() => requestAskAi(editor));
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(within(dialog).getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says so when the cursor is in an empty block', async () => {
    const { editor } = setup();
    act(() => {
      editor.commands.focus();
      editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph' });
    });
    act(() => requestAskAi(editor));
    expect(await screen.findByRole('alert')).toHaveTextContent(/select text inside one paragraph/i);
  });
});

describe('the editor handle (JEF-583)', () => {
  it('reports the selection and replaces a range without a save of its own', () => {
    const { editor, editorRef, onUpdate } = setup();
    expect(editorRef.current!.getSelection()).toBeNull();

    selectTeam(editor);
    const range = editorRef.current!.getSelection()!;
    expect(range).toMatchObject({ kind: 'inline', text: 'team of six' });

    const ok = editorRef.current!.replaceRange(range.from, range.to, [
      { type: 'text', text: 'crew' },
    ]);
    expect(ok).toBe(true);
    expect(editor.getText()).toContain('Led a crew engineers.');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('sends an edit still waiting out the debounce before replacing a range', () => {
    vi.useFakeTimers();
    const { editor, editorRef, onUpdate } = setup();
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size, para('typed'));
    });
    const range = editorRef.current!.getSelection() ?? { from: 1, to: 3 };
    editorRef.current!.replaceRange(range.from, range.to, [{ type: 'text', text: 'ok' }]);
    expect(onUpdate).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
