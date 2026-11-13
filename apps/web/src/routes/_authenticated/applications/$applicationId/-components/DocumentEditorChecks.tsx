import { useEffect, useId, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { checkResume, parseResumeDoc, type AtsHint } from '#/lib/editor/atsChecks';

/** Hints follow typing after a pause, not on every keystroke. */
export const CHECKS_DEBOUNCE_MS = 500;

interface DocumentEditorChecksProps {
  /** The live document JSON. */
  contentJson: string;
  /** Moves the cursor to a top-level block. Hints without a block get no button. */
  onJump?: (nodeIndex: number) => void;
}

function hintsFor(contentJson: string): AtsHint[] {
  const doc = parseResumeDoc(contentJson);
  return doc ? checkResume(doc) : [];
}

/**
 * Non-blocking ATS hints for a resume (JEF-585). Computed in the browser from
 * the document JSON; never gates saving or exporting.
 */
export function DocumentEditorChecks({ contentJson, onJump }: DocumentEditorChecksProps) {
  const { t } = useLocale();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [hints, setHints] = useState<AtsHint[]>(() => hintsFor(contentJson));

  useEffect(() => {
    const timer = setTimeout(() => setHints(hintsFor(contentJson)), CHECKS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [contentJson]);

  return (
    <section
      aria-label={t('documentChecks.title')}
      className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        <span className="inline-flex items-center gap-2">
          {t('documentChecks.title')}
          {hints.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              <span aria-hidden="true">{hints.length}</span>
              <span className="sr-only">{t('documentChecks.badge', { count: hints.length })}</span>
            </span>
          )}
        </span>
        <ChevronDownIcon className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          id={listId}
          className="space-y-2 border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-700"
        >
          {hints.length === 0 && (
            <li className="text-gray-500 dark:text-gray-400">{t('documentChecks.empty')}</li>
          )}
          {hints.map((hint) => (
            <li key={hint.id} className="flex items-start justify-between gap-3">
              <span className="text-gray-700 dark:text-gray-200">{t(hint.messageKey)}</span>
              {hint.nodeIndex !== undefined && onJump && (
                <button
                  type="button"
                  className="shrink-0 font-medium text-blue-600 underline dark:text-blue-400"
                  onClick={() => onJump(hint.nodeIndex!)}
                >
                  {t('documentChecks.jump')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
