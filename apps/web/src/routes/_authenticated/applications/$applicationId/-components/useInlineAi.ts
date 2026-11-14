import { useCallback, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { getErrorMessage } from '#/lib/errors';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { useAiCredits } from '#/components/ai/hooks/useAiCredits';
import { inlineAiInstructions, type InlineAiRequest } from '#/lib/editor/aiActions';
import {
  describeBlockAt,
  describeDocument,
  proposalContent,
  rangeText,
  replaceRangeWithContent,
  type AiRange,
} from '#/lib/editor/selectionRange';
import type { TiptapNode } from '#/lib/markdownToTiptapDoc';
import { requestPolish } from '../-polishApi';

export type AskScope = 'block' | 'document';

export type InlineAiState =
  | { phase: 'idle' }
  /** The slash menu's "Ask AI": a prompt for the block under the cursor or the whole document. */
  | { phase: 'ask'; scope: AskScope; range: AiRange }
  | { phase: 'loading'; range: AiRange }
  | { phase: 'proposal'; range: AiRange; markdown: string; content: TiptapNode[] }
  | { phase: 'error'; range: AiRange | null; code: string | undefined; message: string };

/** A failure of the controller itself, not of the API: shown with the matching i18n key. */
export const INLINE_AI_ERROR = {
  changed: 'documents.editor.ai.changed',
  selectBlocks: 'documents.editor.ai.selectBlocks',
  emptyProposal: 'documents.editor.ai.emptyProposal',
  notApplied: 'documents.editor.ai.notApplied',
} as const;

interface Options {
  editor: Editor;
  draftId: string;
  /** Read-only while a request is in flight, so nothing typed meanwhile is overwritten. */
  setEditable: (editable: boolean) => void;
  /** Sends any edit still waiting out the save debounce, so the range is checked against saved text. */
  flush: () => void;
  /** Called with the document after a proposal is accepted, to be saved as an AI replacement. */
  onApplied?: (contentJson: string, plainText: string) => void;
  /** Translates the controller's own messages. */
  translate: (key: string) => string;
}

export interface InlineAiController {
  state: InlineAiState;
  run: (request: InlineAiRequest, range: AiRange | null) => Promise<void>;
  openAsk: () => void;
  setAskScope: (scope: AskScope) => void;
  accept: () => void;
  dismiss: () => void;
}

/**
 * The inline AI actions on a selection (JEF-583). One request at a time: the
 * editor is read-only while it runs, the answer comes back as a proposal, and
 * nothing changes in the document until Accept. Accept replaces only the range
 * that was sent, and only if its text is still what was sent.
 */
export function useInlineAi({
  editor,
  draftId,
  setEditable,
  flush,
  onApplied,
  translate,
}: Options): InlineAiController {
  const [state, setState] = useState<InlineAiState>({ phase: 'idle' });
  // Dismissing a running request means its answer is ignored when it arrives.
  const token = useRef(0);
  const { refresh } = useAiCredits();

  const fail = useCallback(
    (range: AiRange | null, message: string, code?: string) =>
      setState({ phase: 'error', range, code, message }),
    [],
  );

  const run = useCallback(
    async (request: InlineAiRequest, range: AiRange | null) => {
      if (!range) {
        fail(null, translate(INLINE_AI_ERROR.selectBlocks));
        return;
      }
      const instructions = inlineAiInstructions(request);
      const mine = ++token.current;
      setState({ phase: 'loading', range });
      setEditable(false);
      try {
        const markdown = await requestPolish(draftId, range.text, instructions);
        if (token.current !== mine) return;
        const content = proposalContent(range, markdown);
        if (!content) fail(range, translate(INLINE_AI_ERROR.emptyProposal));
        else setState({ phase: 'proposal', range, markdown, content });
      } catch (err) {
        if (token.current === mine) fail(range, getErrorMessage(err), getGqlErrorCode(err));
      } finally {
        setEditable(true);
        void refresh();
      }
    },
    [draftId, setEditable, refresh, translate, fail],
  );

  const openAsk = useCallback(() => {
    const range = describeBlockAt(editor.state.doc, editor.state.selection.from);
    if (!range) {
      fail(null, translate(INLINE_AI_ERROR.selectBlocks));
      return;
    }
    setState({ phase: 'ask', scope: 'block', range });
  }, [editor, translate, fail]);

  const setAskScope = useCallback(
    (scope: AskScope) => {
      const range =
        scope === 'document'
          ? describeDocument(editor.state.doc)
          : describeBlockAt(editor.state.doc, editor.state.selection.from);
      if (range) setState({ phase: 'ask', scope, range });
    },
    [editor],
  );

  const accept = useCallback(() => {
    if (state.phase !== 'proposal') return;
    flush();
    const { range, content } = state;
    // The proposal was written for the text that was sent. If that text is not
    // what is there now, replacing the range would land on something else.
    const to = Math.min(range.to, editor.state.doc.content.size);
    if (rangeText(editor.state.doc, range.from, to) !== range.text) {
      fail(range, translate(INLINE_AI_ERROR.changed));
      return;
    }
    if (!replaceRangeWithContent(editor, range.from, range.to, content)) {
      fail(range, translate(INLINE_AI_ERROR.notApplied));
      return;
    }
    setState({ phase: 'idle' });
    onApplied?.(JSON.stringify(editor.getJSON()), editor.getText());
  }, [state, editor, flush, onApplied, translate, fail]);

  const dismiss = useCallback(() => {
    token.current += 1;
    setState({ phase: 'idle' });
  }, []);

  return { state, run, openAsk, setAskScope, accept, dismiss };
}
