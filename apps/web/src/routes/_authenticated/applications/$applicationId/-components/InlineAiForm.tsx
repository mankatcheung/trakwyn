import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';
import { useAiCredits } from '#/components/ai/hooks/useAiCredits';
import { AiCreditCost } from '#/components/ai/AiCreditCost';
import {
  INLINE_AI_ACTIONS,
  INLINE_AI_CUSTOM_MAX_CHARS,
  type InlineAiRequest,
} from '#/lib/editor/aiActions';

/**
 * The actions of the inline AI menu (JEF-583): the four presets and a free-text
 * "Ask AI…". It is where the credit rules of the AI helper panel apply too: no
 * AI set up shows the same way in, spent credits disable the buttons, and a
 * user on their own key sees no cost.
 */
export function InlineAiForm({
  onRun,
  canRun,
  hint,
  autoFocusPrompt,
}: {
  onRun: (request: InlineAiRequest) => void;
  /** False while there is nothing the actions can replace; `hint` says why. */
  canRun: boolean;
  hint?: string;
  autoFocusPrompt?: boolean;
}) {
  const { t } = useLocale();
  const { needsSetup, onTrakwynAi, canAfford } = useAiCredits();
  const [custom, setCustom] = useState('');
  const exhausted = onTrakwynAi && !canAfford('polishDraft');
  const disabled = !canRun || exhausted;

  if (needsSetup) {
    return (
      <div className="w-64 space-y-2 p-2">
        <p className="text-xs text-gray-700 dark:text-gray-300">{t('aiHelper.setupHelp')}</p>
        <Link
          to="/settings/ai"
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          {t('aiHelper.setupAction')}
        </Link>
      </div>
    );
  }

  const submitCustom = () => {
    if (disabled || custom.trim() === '') return;
    onRun({ kind: 'custom', text: custom });
  };

  return (
    <div className="w-72 max-w-full space-y-2 p-2">
      <div
        role="group"
        aria-label={t('documents.editor.ai.actions')}
        className="flex flex-wrap gap-1"
      >
        {INLINE_AI_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => onRun({ kind: 'preset', action: action.id })}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {t(action.labelKey)}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          submitCustom();
        }}
      >
        <input
          type="text"
          value={custom}
          maxLength={INLINE_AI_CUSTOM_MAX_CHARS}
          // Asking for AI from the slash menu starts here.
          autoFocus={autoFocusPrompt}
          disabled={disabled}
          onChange={(event) => setCustom(event.target.value)}
          aria-label={t('documents.editor.ai.askLabel')}
          placeholder={t('documents.editor.ai.askPlaceholder')}
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={disabled || custom.trim() === ''}
          className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('documents.editor.ai.run')}
        </button>
      </form>
      {exhausted ? (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          {t('aiHelper.exhausted')}{' '}
          <Link to="/settings/ai" className="font-medium underline">
            {t('aiHelper.exhaustedLink')}
          </Link>
        </p>
      ) : (
        <>
          {!canRun && hint && <p className="text-xs text-gray-600 dark:text-gray-400">{hint}</p>}
          <AiCreditCost feature="polishDraft" />
        </>
      )}
    </div>
  );
}
