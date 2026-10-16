import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarIcon, CheckIcon, EditIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { showUndoToast } from '#/lib/undoToast';
import { useLocale } from '#/lib/i18n';
import {
  Button,
  Card,
  EmptyState,
  FormLabel,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '@trakwyn/ui';
import { invalidateSectionCounts } from '../-sectionCounts';
import { InterviewQuestionsPanel } from './InterviewQuestionsPanel';
import { MockQuestionsPanel } from './MockQuestionsPanel';
const INTERVIEW_ROUNDS_QUERY = `
  query InterviewRounds($applicationId: ID!) {
    interviewRounds(applicationId: $applicationId) {
      id applicationId type scheduledAt completedAt interviewerName notes outcome questionCount mockQuestionCount createdAt updatedAt
    }
  }
`;
const CREATE_ROUND = `
  mutation CreateInterviewRound($input: CreateInterviewRoundInput!) {
    createInterviewRound(input: $input) {
      id applicationId type scheduledAt completedAt interviewerName notes outcome questionCount mockQuestionCount createdAt updatedAt
    }
  }
`;
const UPDATE_ROUND = `
  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {
    updateInterviewRound(id: $id, input: $input) {
      id applicationId type scheduledAt completedAt interviewerName notes outcome questionCount mockQuestionCount createdAt updatedAt
    }
  }
`;
const DELETE_ROUND = `mutation DeleteInterviewRound($id: ID!) { deleteInterviewRound(id: $id) }`;

type InterviewRound = {
  id: string;
  applicationId: string;
  type: string;
  scheduledAt?: string | null;
  completedAt?: string | null;
  interviewerName?: string | null;
  notes?: string | null;
  outcome: string;
  questionCount: number;
  mockQuestionCount: number;
  createdAt: string;
  updatedAt: string;
};

type RoundFormState = {
  type: string;
  scheduledAt: string;
  interviewerName: string;
  notes: string;
  outcome: string;
};

const ROUND_TYPES = ['phone', 'technical', 'onsite', 'hr', 'other'] as const;
const ROUND_OUTCOMES = ['pending', 'passed', 'failed', 'cancelled'] as const;

const OUTCOME_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  passed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

function emptyForm(): RoundFormState {
  return { type: 'phone', scheduledAt: '', interviewerName: '', notes: '', outcome: 'pending' };
}

function generateIcs(rounds: InterviewRound[], company: string, role: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toIcsDate = (iso: string) => {
    const d = new Date(iso);
    return (
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
    );
  };
  const endDate = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
    return (
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
    );
  };
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

  const events = rounds
    .filter((r) => r.scheduledAt)
    .map((r) =>
      [
        'BEGIN:VEVENT',
        `UID:${r.id}@trakwyn`,
        `DTSTART:${toIcsDate(r.scheduledAt!)}`,
        `DTEND:${endDate(r.scheduledAt!)}`,
        `SUMMARY:${esc(`${r.type.charAt(0).toUpperCase() + r.type.slice(1)} interview — ${role} at ${company}`)}`,
        `DESCRIPTION:${esc([r.interviewerName && `Interviewer: ${r.interviewerName}`, r.notes].filter(Boolean).join('\n'))}`,
        'END:VEVENT',
      ].join('\r\n'),
    );

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trakwyn//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadIcs(content: string, company: string, role: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `interview-${company.replace(/\s+/g, '-').toLowerCase()}-${role.replace(/\s+/g, '-').toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [form, setForm] = useState<RoundFormState>(emptyForm());

  const { data, isLoading } = useQuery({
    queryKey: ['interviewRounds', applicationId],
    queryFn: () =>
      gqlClient.request<{ interviewRounds: InterviewRound[] }>(INTERVIEW_ROUNDS_QUERY, {
        applicationId,
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['interviewRounds', applicationId] });
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
      await qc.cancelQueries({ queryKey: ['interviewRounds', applicationId] });
      const prev = qc.getQueryData<{ interviewRounds: InterviewRound[] }>([
        'interviewRounds',
        applicationId,
      ]);
      const optimistic: InterviewRound = {
        id: `__tmp_${Date.now()}`,
        applicationId,
        type: f.type,
        scheduledAt: f.scheduledAt || null,
        interviewerName: f.interviewerName || null,
        notes: f.notes || null,
        outcome: f.outcome,
        questionCount: 0,
        mockQuestionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<{ interviewRounds: InterviewRound[] }>(
        ['interviewRounds', applicationId],
        (old) => ({ interviewRounds: [...(old?.interviewRounds ?? []), optimistic] }),
      );
      return { prev };
    },
    onError: (_err, _f, context) => {
      if (context?.prev) qc.setQueryData(['interviewRounds', applicationId], context.prev);
    },
    onSuccess: () => {
      setShowForm(false);
      setForm(emptyForm());
    },
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
      await qc.cancelQueries({ queryKey: ['interviewRounds', applicationId] });
      const prev = qc.getQueryData<{ interviewRounds: InterviewRound[] }>([
        'interviewRounds',
        applicationId,
      ]);
      qc.setQueryData<{ interviewRounds: InterviewRound[] }>(
        ['interviewRounds', applicationId],
        (old) => ({
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
        }),
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(['interviewRounds', applicationId], context.prev);
    },
    onSuccess: () => setEditingRound(null),
    onSettled: () => invalidate(),
  });

  const rounds = data?.interviewRounds ?? [];

  const openEdit = (r: InterviewRound) => {
    setEditingRound(r);
    setForm({
      type: r.type,
      scheduledAt: r.scheduledAt ? r.scheduledAt.slice(0, 16) : '',
      interviewerName: r.interviewerName ?? '',
      notes: r.notes ?? '',
      outcome: r.outcome,
    });
  };

  const RoundForm = ({
    onSubmit,
    onCancel,
    submitting,
  }: {
    onSubmit: () => void;
    onCancel: () => void;
    submitting: boolean;
  }) => (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FormLabel size="xs">{t('interviews.typeLabel')}</FormLabel>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {ROUND_TYPES.map((roundType) => (
              <option key={roundType} value={roundType}>
                {t(`interviews.${roundType}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FormLabel size="xs">{t('interviews.outcomeLabel')}</FormLabel>
          <Select
            value={form.outcome}
            onChange={(e) => setForm({ ...form, outcome: e.target.value })}
          >
            {ROUND_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {t(`interviews.${outcome}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <FormLabel size="xs">{t('interviews.scheduledAtLabel')}</FormLabel>
        <Input
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
        />
      </div>
      <div>
        <FormLabel size="xs">{t('interviews.interviewerLabel')}</FormLabel>
        <Input
          value={form.interviewerName}
          onChange={(e) => setForm({ ...form, interviewerName: e.target.value })}
          placeholder={t('interviews.interviewerPlaceholder')}
        />
      </div>
      <div>
        <FormLabel size="xs">{t('interviews.notesLabel')}</FormLabel>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="h-20"
          placeholder={t('interviews.notesPlaceholder')}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onSubmit} disabled={submitting}>
          {submitting ? t('applicationForm.saving') : t('common.save')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      {!showForm && !editingRound && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setShowForm(true);
              setForm(emptyForm());
            }}
          >
            <span className="flex items-center gap-1.5">
              <PlusIcon size={14} /> {t('interviews.addInterviewRound')}
            </span>
          </Button>
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
          onSubmit={() => createRound.mutate(form)}
          onCancel={() => setShowForm(false)}
          submitting={createRound.isPending}
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
              onSubmit={() => updateRound.mutate({ id: round.id, f: form })}
              onCancel={() => setEditingRound(null)}
              submitting={updateRound.isPending}
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
                    onClick={() => openEdit(round)}
                    className="rounded-sm p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  >
                    <EditIcon size={14} />
                  </button>
                  <button
                    onClick={() => {
                      const snapshot = qc.getQueryData<{ interviewRounds: InterviewRound[] }>([
                        'interviewRounds',
                        applicationId,
                      ]);
                      qc.setQueryData<{ interviewRounds: InterviewRound[] }>(
                        ['interviewRounds', applicationId],
                        (prev) => ({
                          interviewRounds: (prev?.interviewRounds ?? []).filter(
                            (r) => r.id !== round.id,
                          ),
                        }),
                      );
                      showUndoToast({
                        message: t('interviews.interviewRoundDeletedToast'),
                        operation: { document: DELETE_ROUND, variables: { id: round.id } },
                        onUndo: () => qc.setQueryData(['interviewRounds', applicationId], snapshot),
                        onSettled: invalidate,
                      });
                    }}
                    className="rounded-sm p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  >
                    <Trash2Icon size={14} />
                  </button>
                </div>
              </div>
              {!round.id.startsWith('__tmp_') && (
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
