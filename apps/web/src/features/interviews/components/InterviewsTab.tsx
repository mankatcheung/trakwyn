import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarIcon, CheckIcon, EditIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { showUndoToast } from '#/lib/undoToast';
import { useLocale } from '#/lib/i18n';
import { QuotaHint } from '#/features/quota/components/QuotaHint';
import { useQuotaState } from '#/features/quota/lib/contentQuota';
import { Button, Card, EmptyState, Skeleton } from '@trakwyn/ui';
import { invalidateSectionCounts } from '../../application-detail/lib/sectionCounts';
import {
  CREATE_ROUND,
  DELETE_ROUND,
  UPDATE_ROUND,
  interviewRoundsQueryKey,
  interviewRoundsQueryOptions,
  type InterviewRound,
  type InterviewRoundsData,
} from '../graphql/interviewRoundQueries';
import { buildOptimisticRound, isOptimisticRound } from '../lib/optimisticRound';
import { downloadIcs, generateIcs } from '../lib/roundCalendarExport';
import { emptyForm, roundToForm, type RoundFormState } from '../lib/roundForm';
import { InterviewQuestionsPanel } from './InterviewQuestionsPanel';
import { MockQuestionsPanel } from './mock/MockQuestionsPanel';
import { RoundForm } from './RoundForm';

const OUTCOME_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  passed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export function InterviewsTab({
  applicationId,
  company,
  role,
}: {
  applicationId: string;
  company: string;
  role: string;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRound, setEditingRound] = useState<InterviewRound | null>(null);

  const roundsKey = interviewRoundsQueryKey(applicationId);
  const { data, isLoading } = useQuery(interviewRoundsQueryOptions(applicationId));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: roundsKey });
    invalidateSectionCounts(qc, applicationId);
  };

  const createRound = useMutation({
    mutationFn: (f: RoundFormState) =>
      gqlClient.request(CREATE_ROUND, {
        input: {
          applicationId,
          type: f.type,
          ...(f.scheduledAt ? { scheduledAt: f.scheduledAt } : {}),
          ...(f.interviewerName ? { interviewerName: f.interviewerName } : {}),
          ...(f.notes ? { notes: f.notes } : {}),
          outcome: f.outcome,
        },
      }),
    onMutate: async (f) => {
      await qc.cancelQueries({ queryKey: roundsKey });
      const prev = qc.getQueryData<InterviewRoundsData>(roundsKey);
      const optimistic = buildOptimisticRound(applicationId, f);
      qc.setQueryData<InterviewRoundsData>(roundsKey, (old) => ({
        interviewRounds: [...(old?.interviewRounds ?? []), optimistic],
      }));
      return { prev };
    },
    onError: (_err, _f, context) => {
      if (context?.prev) qc.setQueryData(roundsKey, context.prev);
    },
    onSuccess: () => setShowForm(false),
    onSettled: () => invalidate(),
  });

  const updateRound = useMutation({
    mutationFn: ({ id, f }: { id: string; f: RoundFormState }) =>
      gqlClient.request(UPDATE_ROUND, {
        id,
        input: {
          type: f.type,
          scheduledAt: f.scheduledAt || null,
          interviewerName: f.interviewerName || null,
          notes: f.notes || null,
          outcome: f.outcome,
        },
      }),
    onMutate: async ({ id, f }) => {
      await qc.cancelQueries({ queryKey: roundsKey });
      const prev = qc.getQueryData<InterviewRoundsData>(roundsKey);
      qc.setQueryData<InterviewRoundsData>(roundsKey, (old) => ({
        interviewRounds: (old?.interviewRounds ?? []).map((r) =>
          r.id === id
            ? {
                ...r,
                type: f.type,
                scheduledAt: f.scheduledAt || null,
                interviewerName: f.interviewerName || null,
                notes: f.notes || null,
                outcome: f.outcome,
                updatedAt: new Date().toISOString(),
              }
            : r,
        ),
      }));
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(roundsKey, context.prev);
    },
    onSuccess: () => setEditingRound(null),
    onSettled: () => invalidate(),
  });

  const rounds = data?.interviewRounds ?? [];
  const roundsFull = useQuotaState('interviewRounds', rounds.length)?.level === 'full';

  return (
    <div className="space-y-4">
      {!showForm && !editingRound && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={roundsFull} onClick={() => setShowForm(true)}>
            <span className="flex items-center gap-1.5">
              <PlusIcon size={14} /> {t('interviews.addInterviewRound')}
            </span>
          </Button>
          <QuotaHint resource="interviewRounds" used={rounds.length} />
          {rounds.some((r) => r.scheduledAt) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => downloadIcs(generateIcs(rounds, company, role), company, role)}
            >
              <span className="flex items-center gap-1.5">
                <CalendarIcon size={14} /> {t('interviews.exportToCalendar')}
              </span>
            </Button>
          )}
        </div>
      )}

      {showForm && (
        <RoundForm
          initial={emptyForm()}
          onSave={(values) => createRound.mutateAsync(values)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : (
        rounds.length === 0 &&
        !showForm && (
          <EmptyState
            size="compact"
            className="py-4"
            message={t('interviews.noInterviewRoundsYet')}
          />
        )
      )}

      {rounds.map((round) => (
        <Card key={round.id} className="p-4">
          {editingRound?.id === round.id ? (
            <RoundForm
              initial={roundToForm(round)}
              onSave={(values) => updateRound.mutateAsync({ id: round.id, f: values })}
              onCancel={() => setEditingRound(null)}
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 capitalize dark:text-gray-100">
                      {t(`interviews.${round.type}`, { defaultValue: round.type })}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${OUTCOME_STYLES[round.outcome] ?? OUTCOME_STYLES.pending}`}
                    >
                      {t(`interviews.${round.outcome}`, { defaultValue: round.outcome })}
                    </span>
                  </div>
                  {round.interviewerName && (
                    <p className="text-xs text-gray-500">
                      {t('interviews.withInterviewer', { name: round.interviewerName })}
                    </p>
                  )}
                  {round.scheduledAt && (
                    <p className="flex items-center gap-1 text-xs text-gray-400">
                      <CheckIcon size={11} />
                      {new Date(round.scheduledAt).toLocaleString()}
                    </p>
                  )}
                  {round.notes && (
                    <p className="mt-2 text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                      {round.notes}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditingRound(round)}
                    className="rounded-sm p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  >
                    <EditIcon size={14} />
                  </button>
                  <button
                    onClick={() => {
                      const snapshot = qc.getQueryData<InterviewRoundsData>(roundsKey);
                      qc.setQueryData<InterviewRoundsData>(roundsKey, (prev) => ({
                        interviewRounds: (prev?.interviewRounds ?? []).filter(
                          (r) => r.id !== round.id,
                        ),
                      }));
                      showUndoToast({
                        message: t('interviews.interviewRoundDeletedToast'),
                        operation: { document: DELETE_ROUND, variables: { id: round.id } },
                        onUndo: () => qc.setQueryData(roundsKey, snapshot),
                        onSettled: invalidate,
                      });
                    }}
                    className="rounded-sm p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  >
                    <Trash2Icon size={14} />
                  </button>
                </div>
              </div>
              {!isOptimisticRound(round) && (
                <>
                  <InterviewQuestionsPanel
                    applicationId={applicationId}
                    roundId={round.id}
                    questionCount={round.questionCount}
                  />
                  <MockQuestionsPanel
                    applicationId={applicationId}
                    roundId={round.id}
                    mockQuestionCount={round.mockQuestionCount}
                  />
                </>
              )}
              <p className="mt-2 text-xs text-gray-400">
                {new Date(round.createdAt).toLocaleString()}
              </p>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
