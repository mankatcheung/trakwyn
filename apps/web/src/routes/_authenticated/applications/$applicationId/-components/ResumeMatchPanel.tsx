import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, TargetIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { Spinner } from '@trakwyn/ui';
import { SCORE_COLORS, scoreColor } from './HealthScorePanel';
import {
  COMPUTE_RESUME_MATCH_SCORE,
  findResumeMatch,
  resumeMatchesQueryKey,
  resumeMatchesQueryOptions,
  type ResumeMatch,
  type ResumeRef,
} from '../-resumeMatchQueries';

interface ResumeMatchPanelProps {
  applicationId: string;
  resume: ResumeRef;
}

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
 * The match for one resume: a Generate button until there is a result, then
 * the saved result with a Regenerate button. The result is stored server-side,
 * so it is still here after a reload; `isStale` says the resume's text has
 * changed since it was scored.
 */
export function ResumeMatchPanel({ applicationId, resume }: ResumeMatchPanelProps) {
  const { t, formatDate } = useLocale();
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
    },
  });

  const color = match ? SCORE_COLORS[scoreColor(match.score)] : null;

  const button = (
    <button
      type="button"
      onClick={() => compute.mutate()}
      disabled={compute.isPending}
      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
    >
      {compute.isPending ? (
        <>
          <Spinner tone="white" />
          {t('resumeMatch.checkingMatch')}
        </>
      ) : (
        <>
          <TargetIcon size={14} />
          {match ? t('resumeMatch.regenerate') : t('resumeMatch.generate')}
        </>
      )}
    </button>
  );

  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3 dark:border-gray-700">
      {match && color ? (
        <>
          <div
            className={`flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-700 ${color.bg}`}
          >
            <ScoreRing match={match} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {t('resumeMatch.resumeMatchTitle')}
              </p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color.badge}`}
              >
                {match.label}
              </span>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('resumeMatch.generatedOn', {
                  date: formatDate(new Date(match.generatedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
              </p>
            </div>
            {button}
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
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('resumeMatch.notGenerated')}
          </p>
          {button}
        </div>
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
