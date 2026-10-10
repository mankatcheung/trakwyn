import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SparklesIcon } from 'lucide-react';
import { Button, FormLabel, Textarea } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import {
  CREATE_MOCK_QUESTION,
  GENERATE_MOCK_QUESTIONS,
  type GeneratedQuestions,
} from './mockQuestionApi';
import { MOCK_QUESTION_LIMITS } from './interviewQuestionLimits';

/**
 * Asks the AI for practice questions and lets the user choose which to keep.
 * Nothing is saved until "Add to Practice": the suggestions live only here.
 */
export function MockQuestionGenerator({
  roundId,
  slotsLeft,
  onSaved,
  onClose,
}: {
  roundId: string;
  slotsLeft: number;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<GeneratedQuestions | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const promptId = `generate-prompt-${useId()}`;

  const generate = useMutation({
    mutationFn: () =>
      gqlClient.request<{ generateMockInterviewQuestions: GeneratedQuestions }>(
        GENERATE_MOCK_QUESTIONS,
        {
          interviewRoundId: roundId,
          prompt: prompt.trim() || null,
          count: MOCK_QUESTION_LIMITS.GENERATE_COUNT,
        },
      ),
    onSuccess: (data) => {
      const next = data.generateMockInterviewQuestions;
      setResult(next);
      setSelected(new Set(next.suggestions.map((_, i) => i)));
    },
  });

  const save = useMutation({
    // One at a time: each create reserves a quota slot, so running them in
    // parallel would let the first few race the limit instead of failing cleanly.
    mutationFn: async (questions: string[]) => {
      for (const question of questions) {
        await gqlClient.request(CREATE_MOCK_QUESTION, {
          input: { interviewRoundId: roundId, question },
        });
      }
    },
    onSettled: onSaved,
    onSuccess: onClose,
  });

  const suggestions = result?.suggestions ?? [];
  const chosen = suggestions.filter((_, i) => selected.has(i));
  const overLimit = chosen.length > slotsLeft;
  const toggle = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const contextNote = result
    ? !result.usedJobDescription && !result.usedBriefing
      ? t('interviews.noContextNote')
      : !result.usedBriefing
        ? t('interviews.noBriefingNote')
        : !result.usedJobDescription
          ? t('interviews.noDescriptionNote')
          : null
    : null;

  return (
    <div className="space-y-3 rounded-lg border-2 border-violet-500 bg-violet-50/40 p-3 dark:bg-violet-900/10">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
        <SparklesIcon size={14} aria-hidden="true" />
        {t('interviews.generateTitle')}
      </h4>
      <div>
        <FormLabel size="xs" htmlFor={promptId}>
          {t('interviews.generatePromptLabel')}{' '}
          <span className="font-normal text-gray-500">{t('interviews.responseOptional')}</span>
        </FormLabel>
        <Textarea
          id={promptId}
          value={prompt}
          maxLength={MOCK_QUESTION_LIMITS.PROMPT_MAX_CHARS}
          onChange={(e) => setPrompt(e.target.value)}
          className="h-20"
          placeholder={t('interviews.generatePromptPlaceholder')}
        />
      </div>
      {generate.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {getErrorMessage(generate.error)}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={generate.isPending || save.isPending}
          onClick={() => generate.mutate()}
        >
          {generate.isPending
            ? t('interviews.generating')
            : result
              ? t('interviews.regenerate')
              : t('interviews.generate')}
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {t('interviews.suggestionsHeading', { count: suggestions.length })}
          </p>
          {contextNote && (
            <p className="text-xs text-amber-800 dark:text-amber-300">{contextNote}</p>
          )}
          <ul className="space-y-2">
            {suggestions.map((suggestion, index) => (
              <li key={`${index}-${suggestion}`}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0"
                    checked={selected.has(index)}
                    onChange={() => toggle(index)}
                  />
                  <span className="min-w-0 wrap-break-word text-gray-900 dark:text-gray-100">
                    {suggestion}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {save.isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {getErrorMessage(save.error)}
            </p>
          )}
          {overLimit && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {t('interviews.practiceLimitReached', {
                max: MOCK_QUESTION_LIMITS.QUESTIONS_PER_ROUND,
              })}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('interviews.selectedCount', { count: chosen.length })} ·{' '}
            {t('interviews.suggestionNote')}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t('interviews.discardSuggestions')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={chosen.length === 0 || overLimit || save.isPending || generate.isPending}
              onClick={() => save.mutate(chosen)}
            >
              {save.isPending
                ? t('applicationForm.saving')
                : t('interviews.addSelected', { count: chosen.length })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
