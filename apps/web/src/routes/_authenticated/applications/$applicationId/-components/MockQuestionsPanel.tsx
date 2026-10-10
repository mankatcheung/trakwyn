import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EditIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button, FormLabel, IconButton, Input, Skeleton, Textarea } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { showUndoToast } from '#/lib/undoToast';
import { AiGeneratedBadge } from './AiGeneratedBadge';
import { MockAnswerDraft } from './MockAnswerDraft';
import { MockQuestionGenerator } from './MockQuestionGenerator';
import { INTERVIEW_QUESTION_LIMITS, MOCK_QUESTION_LIMITS } from './interviewQuestionLimits';
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
} from './mockQuestionApi';

type FormState = { question: string; answer: string };
const EMPTY_FORM: FormState = { question: '', answer: '' };

/** 44px square on a phone; the icon button's own compact size from `sm` up. */
const ENTRY_ACTION_CLASS = 'h-11 w-11 sm:h-auto sm:w-auto';

function MockQuestionForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  submitting: boolean;
  error: string | null;
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState(initial);
  const questionId = `mock-question-${useId()}`;
  const answerId = `mock-answer-${useId()}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border-2 border-blue-600 bg-blue-50/40 p-3 dark:bg-blue-900/10"
    >
      <div>
        <FormLabel size="xs" htmlFor={questionId}>
          {t('interviews.questionLabel')}
        </FormLabel>
        <Input
          id={questionId}
          value={form.question}
          maxLength={INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS}
          onChange={(e) => setForm({ ...form, question: e.target.value })}
          placeholder={t('interviews.practiceQuestionPlaceholder')}
          autoFocus
        />
      </div>
      <div>
        <FormLabel size="xs" htmlFor={answerId}>
          {t('interviews.practiceAnswerLabel')}{' '}
          <span className="font-normal text-gray-500">{t('interviews.responseOptional')}</span>
        </FormLabel>
        <Textarea
          id={answerId}
          value={form.answer}
          maxLength={INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS}
          onChange={(e) => setForm({ ...form, answer: e.target.value })}
          className="h-24"
          placeholder={t('interviews.practiceAnswerPlaceholder')}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={submitting || !form.question.trim()}>
          {submitting ? t('applicationForm.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  );
}

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
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
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
    mutationFn: (f: FormState) =>
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
    mutationFn: ({ id, f }: { id: string; f: FormState }) =>
      gqlClient.request(UPDATE_MOCK_QUESTION, {
        id,
        input: { question: f.question, answer: f.answer.trim() ? f.answer : null },
      }),
    onSuccess: () => setEditingId(null),
    onSettled: refresh,
  });

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
      }),
    onSuccess: (result, id) => setDraft({ id, text: result.generateMockInterviewAnswer.answer }),
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
    create.reset();
    update.reset();
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
              <MockQuestionForm
                key={q.id}
                initial={{ question: q.question, answer: q.answer ?? '' }}
                submitting={update.isPending}
                error={update.isError ? getErrorMessage(update.error) : null}
                onSubmit={(f) => update.mutate({ id: q.id, f })}
                onCancel={closeForms}
              />
            ) : (
              <article
                key={q.id}
                className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold wrap-break-word text-gray-900 dark:text-gray-100">
                      {q.question}
                    </p>
                    {q.answer ? (
                      <>
                        <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                          {q.answer}
                        </p>
                        {q.answerSource === 'ai' && <AiGeneratedBadge />}
                      </>
                    ) : (
                      draft?.id !== q.id && (
                        <div className="space-y-2">
                          <p className="text-sm text-gray-500 italic">
                            {t('interviews.noAnswerYet')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => startEditing(q.id)}
                            >
                              {t('interviews.writeAnswer')}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={draftAnswer.isPending}
                              onClick={() => startDraft(q.id)}
                            >
                              <span className="flex items-center gap-1.5">
                                <SparklesIcon size={13} aria-hidden="true" />
                                {draftAnswer.isPending && draftAnswer.variables === q.id
                                  ? t('interviews.generating')
                                  : t('interviews.generateAnswer')}
                              </span>
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1 border-t border-gray-100 pt-2 sm:items-start sm:gap-0.5 sm:border-t-0 sm:pt-0 dark:border-gray-700">
                    <IconButton
                      className={ENTRY_ACTION_CLASS}
                      label={t('interviews.moveQuestionUp')}
                      icon={<ArrowUpIcon size={14} />}
                      size="sm"
                      disabled={index === 0 || reorder.isPending || reorderLocked}
                      onClick={() => move(index, -1)}
                    />
                    <IconButton
                      className={ENTRY_ACTION_CLASS}
                      label={t('interviews.moveQuestionDown')}
                      icon={<ArrowDownIcon size={14} />}
                      size="sm"
                      disabled={
                        index === questions.length - 1 || reorder.isPending || reorderLocked
                      }
                      onClick={() => move(index, 1)}
                    />
                    <IconButton
                      className={ENTRY_ACTION_CLASS}
                      label={t('interviews.editQuestion')}
                      icon={<EditIcon size={14} />}
                      size="sm"
                      variant="subtle"
                      onClick={() => startEditing(q.id)}
                    />
                    <IconButton
                      className={ENTRY_ACTION_CLASS}
                      label={t('interviews.deleteQuestion')}
                      icon={<Trash2Icon size={14} />}
                      size="sm"
                      variant="danger"
                      onClick={() => remove(q)}
                    />
                  </div>
                </div>
                {draft?.id === q.id && (
                  <MockAnswerDraft
                    key={draft.text}
                    questionId={q.id}
                    initialDraft={draft.text}
                    saving={saveDraft.isPending}
                    saveError={saveDraft.isError ? getErrorMessage(saveDraft.error) : null}
                    onSave={(answer) => saveDraft.mutate({ id: q.id, answer })}
                    onDiscard={closeForms}
                  />
                )}
              </article>
            ),
          )}

          {generating ? (
            <MockQuestionGenerator
              roundId={roundId}
              slotsLeft={slotsLeft}
              onSaved={refresh}
              onClose={() => setGenerating(false)}
            />
          ) : adding ? (
            <MockQuestionForm
              initial={EMPTY_FORM}
              submitting={create.isPending}
              error={create.isError ? getErrorMessage(create.error) : null}
              onSubmit={(f) => create.mutate(f)}
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
