import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, TargetIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { Modal, Spinner } from '@trakwyn/ui';
import { SCORE_COLORS, scoreColor } from './HealthScorePanel';
import {
  COMPUTE_RESUME_MATCH_SCORE,
  findResumeMatch,
  resumeMatchesQueryKey,
  resumeMatchesQueryOptions,
  type ResumeMatch,
  type ResumeRef,
} from '../-resumeMatchQueries';

const sameResume = (a: ResumeMatch, b: ResumeMatch): boolean =>
  (a.documentDraftId !== null && a.documentDraftId === b.documentDraftId) ||
  (a.documentId !== null && a.documentId === b.documentId);

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ScoreRing({ match }: { match: ResumeMatch }) {
  const color = SCORE_COLORS[scoreColor(match.score)];
  const dashOffset = CIRCUMFERENCE - (match.score / 100) * CIRCUMFERENCE;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0" aria-hidden="true">
      <circle
        cx="26"
        cy="26"
        r={RADIUS}
        fill="none"
        strokeWidth="5"
        className="text-gray-200 dark:text-gray-700"
        stroke="currentColor"
      />
      <circle
        cx="26"
        cy="26"
        r={RADIUS}
        fill="none"
        strokeWidth="5"
        stroke="currentColor"
        className={color.ring}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
      />
      <text
        x="26"
        y="30"
        textAnchor="middle"
        fontSize="13"
        fontWeight="bold"
        fill="currentColor"
        className={color.ring}
      >
        {match.score}
      </text>
    </svg>
  );
}

function KeywordList({
  title,
  keywords,
  chipClass,
}: {
  title: string;
  keywords: string[];
  chipClass: string;
}) {
  if (keywords.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <span key={kw} className={`rounded-full px-2 py-0.5 text-xs ${chipClass}`}>
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The saved match for one resume, and the mutation that (re)computes it. The
 * result is stored server-side, so it is still here after a reload; `isStale`
 * says the resume's text has changed since it was scored.
 */
function useResumeMatch(applicationId: string, resume: ResumeRef, onSettled: () => void) {
  const qc = useQueryClient();
  const { data } = useQuery(resumeMatchesQueryOptions(applicationId));
  const match = findResumeMatch(data?.resumeMatches, resume);

  const compute = useMutation({
    mutationFn: () =>
      gqlClient.request<{ computeResumeMatchScore: ResumeMatch }>(COMPUTE_RESUME_MATCH_SCORE, {
        applicationId,
        documentDraftId: 'documentDraftId' in resume ? resume.documentDraftId : null,
        documentId: 'documentId' in resume ? resume.documentId : null,
      }),
    onSuccess: ({ computeResumeMatchScore: saved }) => {
      qc.setQueryData<{ resumeMatches: ResumeMatch[] }>(
        resumeMatchesQueryKey(applicationId),
        (prev) => ({
          resumeMatches: [
            ...(prev?.resumeMatches ?? []).filter(
              (m) => m.id !== saved.id && !sameResume(m, saved),
            ),
            saved,
          ],
        }),
      );
      onSettled();
    },
    // A first check that fails has no result to show, so the modal carries the error.
    onError: onSettled,
  });

  return { match, compute };
}

type Compute = ReturnType<typeof useResumeMatch>['compute'];

const CHIP_CLASS =
  'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors';

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
          {t('resumeMatch.checkingMatch')}
        </>
      ) : (
        <>
          <TargetIcon size={14} />
          {label}
        </>
      )}
    </button>
  );
}

function MatchChip({
  match,
  compute,
  onOpen,
}: {
  match: ResumeMatch | undefined;
  compute: Compute;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  if (!match) {
    return (
      <ComputeButton
        compute={compute}
        label={t('resumeMatch.generate')}
        className={`${CHIP_CLASS} border-gray-300 bg-white text-blue-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-gray-700`}
      />
    );
  }
  const color = SCORE_COLORS[scoreColor(match.score)];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`${CHIP_CLASS} border-transparent ${color.badge}`}
    >
      {match.isStale && <AlertTriangleIcon size={14} aria-label={t('resumeMatch.stale')} />}
      <span>
        {match.score} · {match.label}
      </span>
    </button>
  );
}

function MatchDetails({ match, compute }: { match: ResumeMatch | undefined; compute: Compute }) {
  const { t, formatDate } = useLocale();
  const color = match ? SCORE_COLORS[scoreColor(match.score)] : null;

  return (
    <div className="space-y-3">
      {match && color && (
        <>
          <div
            className={`flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-700 ${color.bg}`}
          >
            <ScoreRing match={match} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {match.label}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('resumeMatch.generatedOn', {
                  date: formatDate(new Date(match.generatedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
              </p>
            </div>
            <ComputeButton
              compute={compute}
              label={t('resumeMatch.regenerate')}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            />
          </div>

          {match.isStale && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
            >
              <AlertTriangleIcon size={14} className="mt-0.5 shrink-0" />
              <span>{t('resumeMatch.staleReminder')}</span>
            </div>
          )}

          {match.summary && (
            <p className="text-sm text-gray-700 dark:text-gray-300">{match.summary}</p>
          )}
          <KeywordList
            title={t('resumeMatch.matchedKeywords')}
            keywords={match.matchedKeywords}
            chipClass="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          />
          <KeywordList
            title={t('resumeMatch.missingKeywords')}
            keywords={match.missingKeywords}
            chipClass="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          />
        </>
      )}

      {compute.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          <AiErrorMessage
            code={getGqlErrorCode(compute.error)}
            fallback={getErrorMessage(compute.error)}
          />
        </p>
      )}
    </div>
  );
}

interface ResumeMatchProps {
  applicationId: string;
  resume: ResumeRef;
  /**
   * The chip belongs in the row's action cluster, so this hands the row both
   * pieces instead of laying them out itself. `details` is the modal the chip
   * opens; it renders nothing while closed.
   */
  children: (parts: { chip: ReactNode; details: ReactNode }) => ReactNode;
}

/**
 * The match for one resume: a "Generate match" chip until there is a result,
 * then a score chip that opens the summary and keywords in a modal (JEF-399,
 * JEF-405).
 */
export function ResumeMatch({ applicationId, resume, children }: ResumeMatchProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  // A fresh result or error opens itself: the chip alone would hide what was just asked for.
  const { match, compute } = useResumeMatch(applicationId, resume, () => setOpen(true));

  return children({
    chip: <MatchChip match={match} compute={compute} onOpen={() => setOpen(true)} />,
    details: (
      <Modal open={open} onClose={() => setOpen(false)} title={t('resumeMatch.resumeMatchTitle')}>
        <div className="p-4">
          <MatchDetails match={match} compute={compute} />
        </div>
      </Modal>
    ),
  });
}
