import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Button } from '@trakwyn/ui';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { Markdown } from '#/components/Markdown';
import { useLocale } from '#/lib/i18n';
import type { InlineAiRequest } from '#/lib/editor/aiActions';
import type { AiRange } from '#/lib/editor/selectionRange';
import { InlineAiForm } from './InlineAiForm';
import type { InlineAiController } from './useInlineAi';

/** A rectangle floating-ui can measure: the span from the range's start to its end on screen. */
function rangeReference(editor: Editor, range: AiRange) {
  return {
    getBoundingClientRect: () => {
      const size = editor.state.doc.content.size;
      const start = editor.view.coordsAtPos(Math.min(range.from, size));
      const end = editor.view.coordsAtPos(Math.min(range.to, size));
      const left = Math.min(start.left, end.left);
      const top = Math.min(start.top, end.top);
      const right = Math.max(start.right, end.right);
      const bottom = Math.max(start.bottom, end.bottom);
      return {
        x: left,
        y: top,
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      };
    },
  };
}

/** Keeps `element` beside the range, flipping and shifting to stay on screen. */
function useBesideRange(editor: Editor, range: AiRange | null) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !range) return;
    const reference = rangeReference(editor, range);
    return autoUpdate(reference, element, () => {
      void computePosition(reference, element, {
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => setPosition({ x, y }));
    });
  }, [editor, range]);

  return { ref, position };
}

function proposedText(content: Array<{ text?: string }>): string {
  return content.map((node) => node.text ?? '').join('');
}

/**
 * The inline AI action's answer, shown beside the selection (JEF-583): a loading
 * line, then the original and the suggestion with Accept and Reject, or the
 * error. Nothing in the document changes until Accept. The slash menu's "Ask
 * AI" opens it as a prompt first.
 */
export function SelectionProposalCard({
  editor,
  ai,
  onRun,
}: {
  editor: Editor;
  ai: InlineAiController;
  /** Starts a request; the card shows the range it is for. */
  onRun: (request: InlineAiRequest, range: AiRange) => void;
}) {
  const { t } = useLocale();
  const { state } = ai;
  const range = state.phase === 'idle' ? null : state.range;
  const { ref, position } = useBesideRange(editor, range);
  const acceptRef = useRef<HTMLButtonElement | null>(null);

  // A suggestion has arrived: a keyboard user lands on Accept.
  useEffect(() => {
    if (state.phase === 'proposal') acceptRef.current?.focus();
  }, [state.phase]);

  if (state.phase === 'idle') return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('documents.editor.ai.title')}
      style={{ position: 'fixed', left: position?.x ?? 0, top: position?.y ?? 0 }}
      className="z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-gray-200 bg-white text-sm text-gray-900 shadow-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        ai.dismiss();
        editor.chain().focus().run();
      }}
    >
      {state.phase === 'ask' && (
        <div>
          <div
            role="group"
            aria-label={t('documents.editor.ai.scope')}
            className="flex gap-1 p-2 pb-0"
          >
            {(['block', 'document'] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                aria-pressed={state.scope === scope}
                onClick={() => ai.setAskScope(scope)}
                className={`rounded-md px-2 py-1 text-xs ${
                  state.scope === scope
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {t(
                  scope === 'block'
                    ? 'documents.editor.ai.scopeBlock'
                    : 'documents.editor.ai.scopeDocument',
                )}
              </button>
            ))}
          </div>
          <InlineAiForm canRun onRun={(request) => onRun(request, state.range)} autoFocusPrompt />
          <div className="flex justify-end px-2 pb-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => ai.dismiss()}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {state.phase === 'loading' && (
        <div className="flex items-center justify-between gap-2 p-3">
          <p role="status">{t('documents.editor.ai.working')}</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => ai.dismiss()}>
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="space-y-2 p-3">
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            <AiErrorMessage code={state.code} fallback={state.message} />
          </p>
          <Button type="button" size="sm" variant="secondary" onClick={() => ai.dismiss()}>
            {t('common.close')}
          </Button>
        </div>
      )}

      {state.phase === 'proposal' && (
        <div className="space-y-3 p-3">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('documents.editor.ai.original')}
            </p>
            <p className="mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap text-gray-600 dark:text-gray-400">
              {state.range.text}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('documents.editor.ai.suggestion')}
            </p>
            <div className="mt-0.5 max-h-40 overflow-y-auto" data-testid="ai-suggestion">
              {state.range.kind === 'blocks' ? (
                <Markdown content={state.markdown} />
              ) : (
                <p className="whitespace-pre-wrap">{proposedText(state.content)}</p>
              )}
            </div>
          </div>
          {state.range.hasMarks && (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
              {t('documents.editor.ai.flattened')}
            </p>
          )}
          <div className="flex gap-2">
            <button
              ref={acceptRef}
              type="button"
              onClick={() => ai.accept()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              {t('documents.editor.ai.accept')}
            </button>
            <Button type="button" size="sm" variant="secondary" onClick={() => ai.dismiss()}>
              {t('documents.editor.ai.reject')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
