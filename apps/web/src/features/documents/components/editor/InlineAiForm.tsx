import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { SubmitButton } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { useAiCredits } from '#/features/ai/hooks/useAiCredits';
import { AiCreditCost } from '#/features/ai/components/AiCreditCost';
import {
  INLINE_AI_ACTIONS,
  INLINE_AI_CUSTOM_MAX_CHARS,
  type InlineAiRequest,
} from '#/features/documents/lib/editor/aiActions';

const customInstructionSchema = z.object({
  instruction: z.string().max(INLINE_AI_CUSTOM_MAX_CHARS),
});
type CustomInstructionForm = z.infer<typeof customInstructionSchema>;

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
  onRun: (request: InlineAiRequest) => void | Promise<void>;
  /** False while there is nothing the actions can replace; `hint` says why. */
  canRun: boolean;
  hint?: string;
  autoFocusPrompt?: boolean;
}) {
  const { t } = useLocale();
  const { needsSetup, onTrakwynAi, canAfford } = useAiCredits();
  const form = useForm<CustomInstructionForm>({
    resolver: zodResolver(customInstructionSchema),
    defaultValues: { instruction: '' },
  });
  const custom = useWatch({ control: form.control, name: 'instruction' });
  const exhausted = onTrakwynAi && !canAfford('polishDraft');
  const disabled = !canRun || exhausted;

  const { formProps } = useFormAction(form, async ({ instruction }) => {
    if (disabled || instruction.trim() === '') return null;
    await onRun({ kind: 'custom', text: instruction });
    return null;
  });

  if (needsSetup) {
    return (
      <div className="w-64 space-y-2 p-2">
        <p className="text-xs text-stone-700 dark:text-stone-300">{t('aiHelper.setupHelp')}</p>
        <Link
          to="/settings/ai"
          className="inline-flex items-center rounded-lg bg-blue-800 dark:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-900 dark:hover:bg-blue-600"
        >
          {t('aiHelper.setupAction')}
        </Link>
      </div>
    );
  }

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
            className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            {t(action.labelKey)}
          </button>
        ))}
      </div>
      <form {...formProps} className="flex gap-1">
        <input
          type="text"
          {...form.register('instruction')}
          maxLength={INLINE_AI_CUSTOM_MAX_CHARS}
          // Asking for AI from the slash menu starts here.
          autoFocus={autoFocusPrompt}
          disabled={disabled}
          aria-label={t('documents.editor.ai.askLabel')}
          placeholder={t('documents.editor.ai.askPlaceholder')}
          className="min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-900 placeholder:text-stone-500 disabled:opacity-40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
        />
        <SubmitButton
          size="sm"
          disabled={disabled || custom.trim() === ''}
          className="px-2 py-1 text-xs"
        >
          {t('documents.editor.ai.run')}
        </SubmitButton>
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
          {!canRun && hint && <p className="text-xs text-stone-600 dark:text-stone-400">{hint}</p>}
          <AiCreditCost feature="polishDraft" />
        </>
      )}
    </div>
  );
}
