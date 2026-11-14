import { useEffect, useMemo } from 'react';
import type { Editor } from '@tiptap/react';
import { useLocale } from '#/lib/i18n';
import { ASK_AI_EVENT } from '#/lib/editor/askAi';
import type { InlineAiRequest } from '#/lib/editor/aiActions';
import { DocumentEditorBubbleMenu } from './DocumentEditorBubbleMenu';
import { SelectionProposalCard } from './SelectionProposalCard';
import { useInlineAi } from './useInlineAi';
import type { AiRange } from '#/lib/editor/selectionRange';

/**
 * The inline AI actions on a selection (JEF-583): the formatting menu with its
 * AI actions, and the card that shows the answer. It owns the one request in
 * flight, and listens for the slash menu's "Ask AI".
 */
export function InlineAiLayer({
  editor,
  editable,
  draftId,
  setEditable,
  flush,
  onApplied,
}: {
  editor: Editor;
  editable: boolean;
  draftId: string;
  setEditable: (editable: boolean) => void;
  flush: () => void;
  onApplied?: (contentJson: string, plainText: string) => void;
}) {
  const { t } = useLocale();
  const ai = useInlineAi({ editor, draftId, setEditable, flush, onApplied, translate: t });
  const { openAsk, run } = ai;

  useEffect(() => {
    const dom = editor.view.dom;
    dom.addEventListener(ASK_AI_EVENT, openAsk);
    return () => dom.removeEventListener(ASK_AI_EVENT, openAsk);
  }, [editor, openAsk]);

  const menuAi = useMemo(
    () => ({ run: (request: InlineAiRequest, range: AiRange | null) => void run(request, range) }),
    [run],
  );

  return (
    <>
      {/* The formatting menu steps aside while a request or its answer is on screen. */}
      <DocumentEditorBubbleMenu
        editor={editor}
        editable={editable && ai.state.phase === 'idle'}
        ai={menuAi}
      />
      <SelectionProposalCard editor={editor} ai={ai} onRun={menuAi.run} />
    </>
  );
}
