import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EditIcon,
  MessageSquareIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button, IconButton, Skeleton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { showUndoToast } from '#/lib/undoToast';
import { INTERVIEW_QUESTION_LIMITS } from './interviewQuestionLimits';
import { QuestionEntryForm } from './QuestionEntryForm';
import type { QuestionFormValues } from './questionFormSchema';

const QUESTION_FIELDS = 'id interviewRoundId question answer position createdAt updatedAt';

const INTERVIEW_QUESTIONS_QUERY = `
  query InterviewQuestions($interviewRoundId: ID!) {
    interviewQuestions(interviewRoundId: $interviewRoundId) { ${QUESTION_FIELDS} }
  }
`;
const CREATE_QUESTION = `
  mutation CreateInterviewQuestion($input: CreateInterviewQuestionInput!) {
    createInterviewQuestion(input: $input) { ${QUESTION_FIELDS} }
  }
`;
const UPDATE_QUESTION = `
  mutation UpdateInterviewQuestion($id: ID!, $input: UpdateInterviewQuestionInput!) {
    updateInterviewQuestion(id: $id, input: $input) { ${QUESTION_FIELDS} }
  }
`;
const DELETE_QUESTION = `mutation DeleteInterviewQuestion($id: ID!) { deleteInterviewQuestion(id: $id) }`;
const REORDER_QUESTIONS = `
  mutation ReorderInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {
    reorderInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) { ${QUESTION_FIELDS} }
  }
`;

type InterviewQuestion = {
  id: string;
  interviewRoundId: string;
  question: string;
  answer: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

type QuestionsData = { interviewQuestions: InterviewQuestion[] };
const EMPTY_FORM: QuestionFormValues = { question: '', answer: '' };

/** 44px square on a phone; the icon button's own compact size from `sm` up. */
const ENTRY_ACTION_CLASS = 'h-11 w-11 sm:h-auto sm:w-auto';

/**
 * The questions asked in one interview round and how the user answered them.
 * Available whatever the round's outcome: the log is most useful after the
 * round is over, so nothing here is gated on it still being pending.
 */
export function InterviewQuestionsPanel({
  applicationId,
  roundId,
  questionCount,
}: {
  applicationId: string;
  roundId: string;
  questionCount: number;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // A delete is only sent once its undo window closes, so until then the server
  // still lists the question. Keeping the ids here, rather than editing the
  // cache, stops a refetch in that window from bringing the row back.
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);

  const questionsKey = ['interviewQuestions', roundId];
  const roundsKey = ['interviewRounds', applicationId];
  const panelId = `interview-questions-${roundId}`;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: questionsKey,
    queryFn: () =>
      gqlClient.request<QuestionsData>(INTERVIEW_QUESTIONS_QUERY, { interviewRoundId: roundId }),
    enabled: expanded,
  });
  const questions = (data?.interviewQuestions ?? []).filter((q) => !pendingDeletes.includes(q.id));
  const shownCount = Math.max(0, questionCount - pendingDeletes.length);
  // The reorder call must name every question the server holds, including one
  // whose delete has not been sent yet, so it waits for the delete to settle.
  const reorderLocked = pendingDeletes.length > 0;
  const atLimit = questionCount >= INTERVIEW_QUESTION_LIMITS.QUESTIONS_PER_ROUND;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: questionsKey });
    qc.invalidateQueries({ queryKey: roundsKey });
  };

  const create = useMutation({
    mutationFn: (f: QuestionFormValues) =>
      gqlClient.request(CREATE_QUESTION, {
        input: {
          interviewRoundId: roundId,
          question: f.question,
          ...(f.answer.trim() ? { answer: f.answer } : {}),
        },
      }),
    onSuccess: () => setAdding(false),
    onSettled: refresh,
  });

  const update = useMutation({
    mutationFn: ({ id, f }: { id: string; f: QuestionFormValues }) =>
      gqlClient.request(UPDATE_QUESTION, {
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

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) =>
      gqlClient.request(REORDER_QUESTIONS, { interviewRoundId: roundId, orderedIds }),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: questionsKey });
      const prev = qc.getQueryData<QuestionsData>(questionsKey);
      qc.setQueryData<QuestionsData>(questionsKey, (old) => ({
        interviewQuestions: orderedIds
          .map((id) => old?.interviewQuestions.find((q) => q.id === id))
          .filter((q): q is InterviewQuestion => q !== undefined),
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

  const remove = (question: InterviewQuestion) => {
    const release = () => setPendingDeletes((ids) => ids.filter((id) => id !== question.id));
    setPendingDeletes((ids) => [...ids, question.id]);
    showUndoToast({
      message: t('interviews.questionDeletedToast'),
      operation: { document: DELETE_QUESTION, variables: { id: question.id } },
      onUndo: release,
      onSettled: () => {
        release();
        refresh();
      },
    });
  };

  const stopEditing = () => setEditingId(null);

  const startEditing = (id: string) => {
    setAdding(false);
    setEditingId(id);
  };

  const countLabel =
    shownCount > 0
      ? t('interviews.questions', { count: shownCount })
      : t('interviews.noQuestionsYet');

  return (
    <div className="mt-3 space-y-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-semibold sm:inline-flex sm:min-h-9 sm:w-auto ${
          shownCount > 0
            ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
            : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
        }`}
      >
        <span className="flex items-center gap-2">
          <MessageSquareIcon size={15} aria-hidden="true" />
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
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
              {t('interviews.questionsHeading')}
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('interviews.questionsUsed', {
                count: questionCount,
                max: INTERVIEW_QUESTION_LIMITS.QUESTIONS_PER_ROUND,
              })}
            </span>
          </div>

          {isLoading && <Skeleton className="h-16 rounded-lg" />}
          {isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {getErrorMessage(error)}
            </p>
          )}

          {questions.map((q, index) =>
            editingId === q.id ? (
              <QuestionEntryForm
                key={q.id}
                idPrefix="interview"
                initial={{ question: q.question, answer: q.answer ?? '' }}
                questionPlaceholder={t('interviews.questionPlaceholder')}
                answerLabel={t('interviews.responseLabel')}
                answerPlaceholder={t('interviews.responsePlaceholder')}
                onSubmit={(f) => saveEdit(q.id, f)}
                onCancel={stopEditing}
              />
            ) : (
              <article
                key={q.id}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold wrap-break-word text-gray-900 dark:text-gray-100">
                    {q.question}
                  </p>
                  {q.answer ? (
                    <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                      {q.answer}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">
                      {t('interviews.noResponseYet')}{' '}
                      <button
                        type="button"
                        onClick={() => startEditing(q.id)}
                        className="font-semibold text-blue-700 not-italic hover:underline dark:text-blue-400"
                      >
                        {t('interviews.addResponse')}
                      </button>
                    </p>
                  )}
                </div>
                {/* Below sm the actions sit under the text as 44px targets; from sm up they tuck in beside it. */}
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
                    disabled={index === questions.length - 1 || reorder.isPending || reorderLocked}
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
              </article>
            ),
          )}

          {adding ? (
            <QuestionEntryForm
              idPrefix="interview"
              initial={EMPTY_FORM}
              questionPlaceholder={t('interviews.questionPlaceholder')}
              answerLabel={t('interviews.responseLabel')}
              answerPlaceholder={t('interviews.responsePlaceholder')}
              onSubmit={saveNew}
              onCancel={() => setAdding(false)}
            />
          ) : atLimit ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('interviews.questionLimitReached', {
                max: INTERVIEW_QUESTION_LIMITS.QUESTIONS_PER_ROUND,
              })}
            </p>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                setEditingId(null);
                setAdding(true);
              }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <PlusIcon size={14} /> {t('interviews.addQuestion')}
              </span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
