import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Textarea } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { AiGeneratedBadge } from './AiGeneratedBadge';
import { GENERATE_MOCK_ANSWER, type GeneratedAnswer } from './mockQuestionApi';
import { INTERVIEW_QUESTION_LIMITS } from './interviewQuestionLimits';

/**
 * An AI-drafted answer for one practice question, held open for review. The
 * draft is only a suggestion until saved; saving marks it `ai`, and that label
 * then stays on the answer however it is edited afterwards.
 */
export function MockAnswerDraft({
  questionId,
  initialDraft,
  saving,
  saveError,
  onSave,
  onDiscard,
}: {
  questionId: string;
  initialDraft: string;
  saving: boolean;
  saveError: string | null;
  onSave: (answer: string) => void;
  onDiscard: () => void;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(initialDraft);
  const draftId = `answer-draft-${useId()}`;

  const regenerate = useMutation({
    mutationFn: () =>
      gqlClient.request<{ generateMockInterviewAnswer: GeneratedAnswer }>(GENERATE_MOCK_ANSWER, {
        mockInterviewQuestionId: questionId,
      }),
    onSuccess: (data) => setDraft(data.generateMockInterviewAnswer.answer),
  });

  const error = saveError ?? (regenerate.isError ? getErrorMessage(regenerate.error) : null);
  const busy = saving || regenerate.isPending;

  return (
    <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-800 dark:bg-violet-900/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={draftId} className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {t('interviews.practiceAnswerLabel')}
        </label>
        <AiGeneratedBadge label={t('interviews.aiDraft')} />
      </div>
      <Textarea
        id={draftId}
        value={draft}
        maxLength={INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS}
        onChange={(e) => setDraft(e.target.value)}
        className="h-40"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('interviews.aiDraftReview')}</p>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => regenerate.mutate()}
        >
          {regenerate.isPending ? t('interviews.generating') : t('interviews.regenerate')}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>
            {t('interviews.discardDraft')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !draft.trim()}
            onClick={() => onSave(draft)}
          >
            {saving ? t('applicationForm.saving') : t('interviews.saveAnswer')}
          </Button>
        </div>
      </div>
    </div>
  );
}
