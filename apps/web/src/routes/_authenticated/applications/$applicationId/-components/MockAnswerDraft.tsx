import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Textarea } from '@trakwyn/ui';
import { AiActionBar } from '#/components/ai/AiActionBar';
import { AiPromptInput } from '#/components/ai/AiPromptInput';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { AiGeneratedBadge } from './AiGeneratedBadge';
import { GENERATE_MOCK_ANSWER, type GeneratedAnswer } from './mockQuestionApi';
import { INTERVIEW_QUESTION_LIMITS } from './interviewQuestionLimits';
import { readRememberedUseProfile } from './mockBackgroundChoice';

const ANSWER_EXAMPLES = [
  'aiHelper.answerExample1',
  'aiHelper.answerExample2',
  'aiHelper.answerExample3',
] as const;

/**
 * An AI-drafted answer for one practice question, held open for review. The
 * draft is only a suggestion until saved; saving marks it `ai`, and that label
 * then stays on the answer however it is edited afterwards.
 */
export function MockAnswerDraft({
  questionId,
  initialDraft,
  initialUsedProfile,
  saving,
  saveError,
  onSave,
  onDiscard,
}: {
  questionId: string;
  initialDraft: string;
  initialUsedProfile: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: (answer: string) => void;
  onDiscard: () => void;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(initialDraft);
  const [usedProfile, setUsedProfile] = useState(initialUsedProfile);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState('');
  const draftId = `answer-draft-${useId()}`;

  const regenerate = useMutation({
    mutationFn: () =>
      gqlClient.request<{ generateMockInterviewAnswer: GeneratedAnswer }>(GENERATE_MOCK_ANSWER, {
        mockInterviewQuestionId: questionId,
        prompt: instructions.trim() || null,
        useProfile: readRememberedUseProfile(false),
      }),
    onSuccess: (data) => {
      setDraft(data.generateMockInterviewAnswer.answer);
      setUsedProfile(data.generateMockInterviewAnswer.usedProfile);
    },
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
      {usedProfile && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('interviews.draftUsedProfile')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="space-y-2">
        <button
          type="button"
          className="text-xs font-medium text-violet-700 underline dark:text-violet-300"
          aria-expanded={showInstructions}
          onClick={() => setShowInstructions((v) => !v)}
        >
          {showInstructions ? t('aiHelper.hideInstructions') : t('aiHelper.addInstructions')}
        </button>
        <AiActionBar
          feature="mockAnswer"
          onRun={() => regenerate.mutateAsync()}
          label={t('interviews.regenerate')}
          loadingLabel={t('interviews.generating')}
          loading={regenerate.isPending}
          disabled={saving}
        >
          {showInstructions && (
            <AiPromptInput
              value={instructions}
              onChange={setInstructions}
              disabled={regenerate.isPending}
              placeholderExamples={ANSWER_EXAMPLES.map((key) => t(key))}
            />
          )}
        </AiActionBar>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
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
