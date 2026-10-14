import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ScanSearchIcon,
  XCircleIcon,
} from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { Spinner } from '@trakwyn/ui';
import { SCORE_COLORS, scoreColor } from './HealthScorePanel';
import type { ResumeRef } from '../-resumeMatchQueries';
import {
  COMPUTE_RESUME_ATS_SCORE,
  findResumeAtsScore,
  resumeAtsScoresQueryKey,
  resumeAtsScoresQueryOptions,
  type AtsCheck,
  type AtsScore,
} from '../-resumeAtsQueries';

const CHIP_CLASS =
  'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors';

const sameResume = (a: AtsScore, b: AtsScore): boolean =>
  (a.documentDraftId !== null && a.documentDraftId === b.documentDraftId) ||
  (a.documentId !== null && a.documentId === b.documentId);

/**
 * The saved result for one resume, and the mutation that checks it again. The
 * result is stored server-side, so it is still here after a reload; `isStale`
 * says the resume's text has changed since it was scored.
 */
function useResumeAts(applicationId: string, resume: ResumeRef, onComputed: () => void) {
  const qc = useQueryClient();
  const { data } = useQuery(resumeAtsScoresQueryOptions(applicationId));
  const ats = findResumeAtsScore(data?.resumeAtsScores, resume);

  const compute = useMutation({
    mutationFn: () =>
      gqlClient.request<{ computeResumeAtsScore: AtsScore }>(COMPUTE_RESUME_ATS_SCORE, {
        documentDraftId: 'documentDraftId' in resume ? resume.documentDraftId : null,
        documentId: 'documentId' in resume ? resume.documentId : null,
      }),
    onSuccess: ({ computeResumeAtsScore: saved }) => {
      qc.setQueryData<{ resumeAtsScores: AtsScore[] }>(
        resumeAtsScoresQueryKey(applicationId),
        (prev) => ({
          resumeAtsScores: [
            ...(prev?.resumeAtsScores ?? []).filter(
              (s) => s.id !== saved.id && !sameResume(s, saved),
            ),
            saved,
          ],
        }),
      );
      onComputed();
    },
  });
  return { ats, compute };
}

type Compute = ReturnType<typeof useResumeAts>['compute'];

function ComputeButton({
  compute,
  label,
  className,
}: {
  compute: Compute;
  label: string;
  className: string;
}) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      onClick={() => compute.mutate()}
      disabled={compute.isPending}
      className={`${className} disabled:opacity-60`}
    >
      {compute.isPending ? (
        <>
          <Spinner tone="white" />
          {t('resumeAts.checking')}
        </>
      ) : (
        <>
          <ScanSearchIcon size={14} />
          {label}
        </>
      )}
    </button>
  );
}

function AtsChip({
  ats,
  compute,
  expanded,
  onToggle,
}: {
  ats: AtsScore | undefined;
  compute: Compute;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useLocale();
  if (!ats) {
    return (
      <ComputeButton
        compute={compute}
        label={t('resumeAts.check')}
        className={`${CHIP_CLASS} border-gray-300 bg-white text-blue-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-gray-700`}
      />
    );
  }
  const color = SCORE_COLORS[ats.readable ? scoreColor(ats.score) : 'red'];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`${CHIP_CLASS} border-transparent whitespace-nowrap ${color.badge}`}
    >
      {ats.isStale && <AlertTriangleIcon size={14} aria-label={t('resumeAts.stale')} />}
      <span>
        {ats.readable
          ? t('resumeAts.chip', { score: ats.score, label: ats.label })
          : t('resumeAts.notReadableChip')}
      </span>
      <ChevronDownIcon
        size={14}
        aria-hidden="true"
        className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

function CheckRow({ check }: { check: AtsCheck }) {
  const { t } = useLocale();
  const Icon = check.passed ? CheckCircle2Icon : XCircleIcon;
  return (
    <li
      className={`flex items-start gap-2.5 rounded-lg px-3 py-2 ${
        check.passed ? '' : 'bg-red-50 dark:bg-red-900/20'
      }`}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={`mt-0.5 shrink-0 ${check.passed ? 'text-green-600' : 'text-red-600'}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{check.label}</p>
        {!check.passed && (
          <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{check.hint}</p>
        )}
      </div>
      {check.maxPoints > 0 && (
        <span className="shrink-0 text-xs text-gray-600 dark:text-gray-400">
          {t('resumeAts.points', { points: check.points, max: check.maxPoints })}
        </span>
      )}
    </li>
  );
}

function CheckGroup({ title, checks }: { title: string; checks: AtsCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <section>
      <h4 className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">{title}</h4>
      <ul className="space-y-1">
        {checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>
    </section>
  );
}

function AtsDetails({ ats, compute }: { ats: AtsScore | undefined; compute: Compute }) {
  const { t, formatDate } = useLocale();
  const color = ats ? SCORE_COLORS[ats.readable ? scoreColor(ats.score) : 'red'] : null;
  const failed = ats?.checks.filter((c) => !c.passed) ?? [];
  const passed = ats?.checks.filter((c) => c.passed) ?? [];

  return (
    <div className="space-y-3">
      {ats && color && (
        <>
          <div
            className={`flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-700 ${color.bg}`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {t('resumeAts.title')}
                {': '}
                {ats.readable ? `${ats.score} · ${ats.label}` : ats.label}
              </p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {ats.readable ? t('resumeAts.description') : t('resumeAts.notReadable')}
              </p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {t('resumeAts.checkedOn', {
                  date: formatDate(new Date(ats.generatedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
              </p>
            </div>
            <ComputeButton
              compute={compute}
              label={t('resumeAts.recheck')}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            />
          </div>
          {ats.isStale && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
            >
              <AlertTriangleIcon size={14} className="mt-0.5 shrink-0" />
              <span>{t('resumeAts.staleReminder')}</span>
            </div>
          )}
          <CheckGroup title={t('resumeAts.fixFirst', { count: failed.length })} checks={failed} />
          <CheckGroup title={t('resumeAts.passing', { count: passed.length })} checks={passed} />
        </>
      )}

      {compute.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {getErrorMessage(compute.error)}
        </p>
      )}
    </div>
  );
}

interface ResumeAtsProps {
  applicationId: string;
  resume: ResumeRef;
  /** Hands the row the chip for its action cluster and the detail for under it, like `ResumeMatch`. */
  children: (parts: { chip: ReactNode; details: ReactNode }) => ReactNode;
}

/**
 * The ATS-readiness check for one resume (JEF-395): a "Check ATS" chip until
 * there is a result, then a score chip that expands in place to the checklist.
 * The result is saved, so it is still here after a reload. Separate from the
 * job-match score, which needs a job and an AI key.
 */
export function ResumeAts({ applicationId, resume, children }: ResumeAtsProps) {
  const [expanded, setExpanded] = useState(false);
  // A fresh result opens itself: the chip alone would hide what was just asked for.
  const { ats, compute } = useResumeAts(applicationId, resume, () => setExpanded(true));

  const showDetails = (expanded && ats !== undefined) || compute.isError;
  return children({
    chip: (
      <AtsChip
        ats={ats}
        compute={compute}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
    ),
    details: showDetails ? <AtsDetails ats={ats} compute={compute} /> : null,
  });
}
