import { useCallback, useRef, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { useAiCredits } from '../../ai/hooks/useAiCredits';
import { selectionAiInstructions, type SelectionAiRequest } from '../lib/aiActions';
import type { Selection, TextEdit } from '../lib/markdownEditing';
import { usePolishDocumentDraft } from './useDocumentDraftAi';

/** The passage a request was made for: where it sat and what it said. */
export interface AiRange {
  start: number;
  end: number;
  text: string;
}

export type SelectionAiState =
  | { phase: 'idle' }
  | { phase: 'ask'; range: AiRange }
  | { phase: 'loading'; range: AiRange }
  | { phase: 'proposal'; range: AiRange; markdown: string }
  | { phase: 'error'; range: AiRange | null; message: string; changed: boolean };

interface Options {
  draftId: string;
  /** The text on screen right now, not the last save. */
  getText: () => string;
  /** Applies an edit through the editor, so autosave and the cursor stay in one place. */
  applyEdit: (edit: TextEdit) => void;
}

/** The passage is still where it was and still says what was sent. */
function unchanged(text: string, range: AiRange): boolean {
  return text.slice(range.start, range.end) === range.text;
}

/**
 * AI actions on the selected text of the draft editor (JEF-587). Only the
 * selection is sent to the existing Polish call. The answer is a proposal and
 * nothing changes until `accept`, which replaces only that range, and only when
 * its text is still what was sent. One request at a time; a dismissed request's
 * answer is ignored when it arrives.
 */
export function useSelectionAi({ draftId, getText, applyEdit }: Options) {
  const polishMutation = usePolishDocumentDraft();
  const { refresh } = useAiCredits();
  const [state, setState] = useState<SelectionAiState>({ phase: 'idle' });
  const token = useRef(0);

  const openAsk = useCallback(
    (selection: Selection) => {
      const start = Math.min(selection.start, selection.end);
      const end = Math.max(selection.start, selection.end);
      const text = getText().slice(start, end);
      if (text.trim() !== '') setState({ phase: 'ask', range: { start, end, text } });
    },
    [getText],
  );

  const run = useCallback(
    async (request: SelectionAiRequest, selection: Selection) => {
      const instructions = selectionAiInstructions(request);
      const start = Math.min(selection.start, selection.end);
      const end = Math.max(selection.start, selection.end);
      const text = getText().slice(start, end);
      if (!instructions || text.trim() === '') return;
      const range: AiRange = { start, end, text };
      const mine = ++token.current;
      setState({ phase: 'loading', range });
      try {
        const markdown = await polishMutation.mutateAsync({
          draftId,
          plainText: range.text,
          instructions,
        });
        if (token.current !== mine) return;
        if (!unchanged(getText(), range)) {
          setState({ phase: 'error', range, message: '', changed: true });
        } else {
          setState({ phase: 'proposal', range, markdown: markdown.trim() });
        }
      } catch (err) {
        if (token.current === mine) {
          setState({ phase: 'error', range, message: getErrorMessage(err), changed: false });
        }
      } finally {
        void refresh();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftId, getText, polishMutation.mutateAsync, refresh],
  );

  const accept = useCallback(() => {
    if (state.phase !== 'proposal') return;
    const { range, markdown } = state;
    const current = getText();
    if (!unchanged(current, range)) {
      setState({ phase: 'error', range, message: '', changed: true });
      return;
    }
    const text = `${current.slice(0, range.start)}${markdown}${current.slice(range.end)}`;
    const caret = range.start + markdown.length;
    setState({ phase: 'idle' });
    applyEdit({ text, selection: { start: caret, end: caret } });
  }, [state, getText, applyEdit]);

  const dismiss = useCallback(() => {
    token.current += 1;
    setState({ phase: 'idle' });
  }, []);

  return {
    state,
    running: state.phase === 'loading',
    openAsk,
    run,
    accept,
    dismiss,
  };
}
