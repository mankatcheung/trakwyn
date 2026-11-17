import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import { Button, Skeleton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { showUndoToast } from '#/lib/undoToast';
import { MockQuestionGenerator } from './MockQuestionGenerator';
import { MockQuestionCard } from './MockQuestionCard';
import { readRememberedUseProfile } from '../../lib/mockBackgroundChoice';
import { MOCK_QUESTION_LIMITS } from '../../lib/interviewQuestionLimits';
import { QuestionEntryForm } from '../QuestionEntryForm';
import type { QuestionFormValues } from '../../lib/questionFormSchema';
import {
  CREATE_MOCK_QUESTION,
  DELETE_MOCK_QUESTION,
  GENERATE_MOCK_ANSWER,
  MOCK_QUESTIONS_QUERY,
  REORDER_MOCK_QUESTIONS,
  UPDATE_MOCK_QUESTION,
  type GeneratedAnswer,
  type MockQuestion,
  type MockQuestionsData,
} from '../../graphql/mockQuestionApi';

const EMPTY_FORM: QuestionFormValues = { question: '', answer: '' };

/**
 * Practice questions for one interview round: mock questions to prepare with,
 * kept apart from the questions actually asked. The user can write their own,
 * ask the AI for more, and write or AI-draft an answer to each.
 */
export function MockQuestionsPanel({
  applicationId,
  roundId,
  mockQuestionCount,
}: {
  applicationId: string;
  roundId: string;
  mockQuestionCount: number;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; text: string; usedProfile: boolean } | null>(
    null,
  );
  // As for the real questions: a delete is only sent once its undo window
  // closes, so the ids are held here rather than edited out of the cache.
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);

  const questionsKey = ['mockInterviewQuestions', roundId];
  const roundsKey = ['interviewRounds', applicationId];
  const panelId = `mock-questions-${roundId}`;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: questionsKey,
    queryFn: () =>
      gqlClient.request<MockQuestionsData>(MOCK_QUESTIONS_QUERY, { interviewRoundId: roundId }),
    enabled: expanded,
  });
  const questions = (data?.mockInterviewQuestions ?? []).filter(
    (q) => !pendingDeletes.includes(q.id),
  );
  const shownCount = Math.max(0, mockQuestionCount - pendingDeletes.length);
  const reorderLocked = pendingDeletes.length > 0;
  const slotsLeft = Math.max(0, MOCK_QUESTION_LIMITS.QUESTIONS_PER_ROUND - mockQuestionCount);
  const atLimit = slotsLeft === 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: questionsKey });
    qc.invalidateQueries({ queryKey: roundsKey });
  };

  const create = useMutation({
    mutationFn: (f: QuestionFormValues) =>
      gqlClient.request(CREATE_MOCK_QUESTION, {
        input: {
          interviewRoundId: roundId,
          question: f.question,
          ...(f.answer.trim() ? { answer: f.answer } : {}),
        },
      }),
    onSuccess: () => setAdding(false),
    onSettled: refresh,
  });

  // Editing sends no `answerSource`, so an AI answer keeps its label.
  const update = useMutation({
    mutationFn: ({ id, f }: { id: string; f: QuestionFormValues }) =>
      gqlClient.request(UPDATE_MOCK_QUESTION, {
        id,
        input: { question: f.question, answer: f.answer.trim() ? f.answer : null },
      }),
    onSuccess: () => setEditingId(null),
    onSettled: refresh,
  });

  // The form shows a failed save itself, so the action returns the message
  // instead of throwing it.
  const saveNew = async (f: QuestionFormValues) => {
    try {
      await create.mutateAsync(f);
      return null;
    } catch (err) {
      return getErrorMessage(err);
    }
  };

  const saveEdit = async (id: string, f: QuestionFormValues) => {
    try {
      await update.mutateAsync({ id, f });
      return null;
    } catch (err) {
      return getErrorMessage(err);
    }
  };

  const saveDraft = useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) =>
      gqlClient.request(UPDATE_MOCK_QUESTION, { id, input: { answer, answerSource: 'ai' } }),
    onSuccess: () => setDraft(null),
    onSettled: refresh,
  });

  const draftAnswer = useMutation({
    mutationFn: (id: string) =>
      gqlClient.request<{ generateMockInterviewAnswer: GeneratedAnswer }>(GENERATE_MOCK_ANSWER, {
        mockInterviewQuestionId: id,
        useProfile: readRememberedUseProfile(false),
      }),
    onSuccess: (result, id) =>
      setDraft({
        id,
        text: result.generateMockInterviewAnswer.answer,
        usedProfile: result.generateMockInterviewAnswer.usedProfile,
      }),
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) =>
      gqlClient.request(REORDER_MOCK_QUESTIONS, { interviewRoundId: roundId, orderedIds }),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: questionsKey });
      const prev = qc.getQueryData<MockQuestionsData>(questionsKey);
      qc.setQueryData<MockQuestionsData>(questionsKey, (old) => ({
        mockInterviewQuestions: orderedIds
          .map((id) => old?.mockInterviewQuestions.find((q) => q.id === id))
          .filter((q): q is MockQuestion => q !== undefined),
      }));
      return { prev };
    },
    onError: (_err, _ids, context) => {
      if (context?.prev) qc.setQueryData(questionsKey, context.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: questionsKey }),
  });

  const move = (index: number, offset: -1 | 1) => {
    const ids = questions.map((q) => q.id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  const remove = (question: MockQuestion) => {
    const release = () => setPendingDeletes((ids) => ids.filter((id) => id !== question.id));
    setPendingDeletes((ids) => [...ids, question.id]);
    showUndoToast({
      message: t('interviews.practiceDeletedToast'),
      operation: { document: DELETE_MOCK_QUESTION, variables: { id: question.id } },
      onUndo: release,
      onSettled: () => {
        release();
        refresh();
      },
    });
  };

  const closeForms = () => {
    draftAnswer.reset();
    saveDraft.reset();
    setAdding(false);
    setGenerating(false);
    setEditingId(null);
    setDraft(null);
  };

  const startEditing = (id: string) => {
    closeForms();
    setEditingId(id);
  };

  const startDraft = (id: string) => {
    closeForms();
    draftAnswer.mutate(id);
  };

  const countLabel =
    shownCount > 0
      ? t('interviews.practice', { count: shownCount })
      : t('interviews.noPracticeYet');

  return (
    <div className="mt-3 space-y-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-semibold sm:inline-flex sm:min-h-9 sm:w-auto ${
          shownCount > 0
            ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-200'
            : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
        }`}
      >
        <span className="flex items-center gap-2">
          <SparklesIcon size={15} aria-hidden="true" />
          {countLabel}
        </span>
        {expanded ? (
          <ChevronUpIcon size={14} aria-hidden="true" />
        ) : (
          <ChevronDownIcon size={14} aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div id={panelId} className="space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                {t('interviews.practiceHeading')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('interviews.practiceHint')}
              </p>
            </div>
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {t('interviews.questionsUsed', {
                count: mockQuestionCount,
                max: MOCK_QUESTION_LIMITS.QUESTIONS_PER_ROUND,
              })}
            </span>
          </div>

          {isLoading && <Skeleton className="h-16 rounded-lg" />}
          {isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {getErrorMessage(error)}
            </p>
          )}
          {draftAnswer.isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {getErrorMessage(draftAnswer.error)}
            </p>
          )}

          {questions.map((q, index) =>
            editingId === q.id ? (
              <QuestionEntryForm
                key={q.id}
                idPrefix="mock"
                initial={{ question: q.question, answer: q.answer ?? '' }}
                questionPlaceholder={t('interviews.practiceQuestionPlaceholder')}
                answerLabel={t('interviews.practiceAnswerLabel')}
                answerPlaceholder={t('interviews.practiceAnswerPlaceholder')}
                onSubmit={(f) => saveEdit(q.id, f)}
                onCancel={closeForms}
              />
            ) : (
              <MockQuestionCard
                key={q.id}
                applicationId={applicationId}
                question={q}
                index={index}
                total={questions.length}
                reorderDisabled={reorder.isPending || reorderLocked}
                draft={draft?.id === q.id ? draft : null}
                generatingAnswer={draftAnswer.isPending}
                generatingForThis={draftAnswer.isPending && draftAnswer.variables === q.id}
                savingDraft={saveDraft.isPending}
                saveDraftError={saveDraft.isError ? getErrorMessage(saveDraft.error) : null}
                onEdit={() => startEditing(q.id)}
                onGenerateAnswer={() => startDraft(q.id)}
                onMove={(offset) => move(index, offset)}
                onDelete={() => remove(q)}
                onSaveDraft={(answer) => saveDraft.mutate({ id: q.id, answer })}
                onDiscardDraft={closeForms}
                onTalkingPointsSaved={refresh}
              />
            ),
          )}

          {generating ? (
            <MockQuestionGenerator
              applicationId={applicationId}
              roundId={roundId}
              slotsLeft={slotsLeft}
              onSaved={refresh}
              onClose={() => setGenerating(false)}
            />
          ) : adding ? (
            <QuestionEntryForm
              idPrefix="mock"
              initial={EMPTY_FORM}
              questionPlaceholder={t('interviews.practiceQuestionPlaceholder')}
              answerLabel={t('interviews.practiceAnswerLabel')}
              answerPlaceholder={t('interviews.practiceAnswerPlaceholder')}
              onSubmit={saveNew}
              onCancel={closeForms}
            />
          ) : atLimit ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('interviews.practiceLimitReached', {
                max: MOCK_QUESTION_LIMITS.QUESTIONS_PER_ROUND,
              })}
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  closeForms();
                  setAdding(true);
                }}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <PlusIcon size={14} /> {t('interviews.addPracticeQuestion')}
                </span>
              </Button>
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  closeForms();
                  setGenerating(true);
                }}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <SparklesIcon size={14} aria-hidden="true" /> {t('interviews.generateQuestions')}
                </span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
