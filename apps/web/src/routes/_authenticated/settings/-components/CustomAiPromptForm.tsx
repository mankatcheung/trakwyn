import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, SubmitButton, Textarea } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import {
  UPDATE_PROFILE,
  customAiPromptSchema,
  extractGqlError,
  type CustomAiPromptForm as CustomAiPromptValues,
} from './shared';

/** The custom instructions appended to every AI prompt. Saves through `updateProfile`. */
export function CustomAiPromptForm({ customAiPrompt }: { customAiPrompt: string | null }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const form = useForm<CustomAiPromptValues>({
    resolver: zodResolver(customAiPromptSchema),
    values: { customAiPrompt: customAiPrompt ?? '' },
  });
  const error = form.formState.errors.customAiPrompt;

  const update = useMutation({
    mutationFn: (data: CustomAiPromptValues) =>
      gqlClient.request(UPDATE_PROFILE, { customAiPrompt: data.customAiPrompt.trim() || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llmApiKeys'] }),
  });

  const { state, formProps } = useFormAction(form, async (data) => {
    setSaved(false);
    try {
      await update.mutateAsync(data);
      setSaved(true);
      return null;
    } catch (err) {
      return extractGqlError(err) ?? t('integrations.updateCustomInstructionsFailed');
    }
  });

  return (
    <form {...formProps}>
      <Textarea
        {...form.register('customAiPrompt')}
        invalid={!!error}
        rows={3}
        placeholder="e.g. Keep cover letters under 200 words and write in a casual tone."
      />
      {error && <p className="mt-1 text-xs text-red-600">{error.message}</p>}
      {state.error && (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      )}
      {saved && !state.error && (
        <p className="mt-3 text-sm text-green-600">{t('integrations.customInstructionsUpdated')}</p>
      )}
      <SubmitButton pendingLabel={t('applicationForm.saving')} className="mt-3.5">
        {t('integrations.saveInstructions')}
      </SubmitButton>
    </form>
  );
}
