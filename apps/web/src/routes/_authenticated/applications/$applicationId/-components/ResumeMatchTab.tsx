import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { EyeIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { DocumentPreviewModal, isPreviewableMimeType } from './DocumentPreviewModal';
import { documentsQueryOptions } from '../-documentQueries';
import { SCORE_COLORS, scoreColor } from './HealthScorePanel';
import { Card, FormLabel, Spinner, Textarea } from '@trakwyn/ui';

const COMPUTE_RESUME_MATCH_SCORE = `
  mutation ComputeResumeMatchScore($applicationId: ID!, $resumeText: String) {
    computeResumeMatchScore(applicationId: $applicationId, resumeText: $resumeText) {
      score
      label
      matchedKeywords
      missingKeywords
      summary
    }
  }
`;

type ResumeMatchScoreResult = {
  score: number;
  label: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  summary: string;
};

export function ResumeMatchTab({ applicationId }: { applicationId: string }) {
  const { t } = useLocale();
  const [resumeText, setResumeText] = useState('');
  const [overridePaste, setOverridePaste] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: documentsData } = useQuery(documentsQueryOptions(applicationId));
  const resumeDoc = (documentsData?.documents ?? [])
    .filter((d) => d.documentType === 'resume')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const usingUploadedResume = Boolean(resumeDoc) && !overridePaste;

  const compute = useMutation({
    mutationFn: () =>
      gqlClient.request<{ computeResumeMatchScore: ResumeMatchScoreResult }>(
        COMPUTE_RESUME_MATCH_SCORE,
        { applicationId, resumeText: usingUploadedResume ? null : resumeText.trim() || null },
      ),
  });

  const result = compute.data?.computeResumeMatchScore;
  const color = result ? SCORE_COLORS[scoreColor(result.score)] : null;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = result ? circumference - (result.score / 100) * circumference : circumference;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        {usingUploadedResume && resumeDoc ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('resumeMatch.usingUploadedResumePrefix')}{' '}
              <span className="font-medium">{resumeDoc.name}</span>
            </p>
            <div className="flex shrink-0 items-center gap-3">
              {isPreviewableMimeType(resumeDoc.mimeType) && (
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  aria-label={t('resumeMatch.preview')}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <EyeIcon size={14} />{' '}
                  <span className="hidden sm:inline">{t('resumeMatch.preview')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOverridePaste(true)}
                className="text-xs text-blue-600 hover:underline"
              >
                {t('resumeMatch.pasteDifferentText')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <FormLabel>{t('resumeMatch.yourResumeLabel')}</FormLabel>
            <Textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={6}
              placeholder={t('resumeMatch.pasteResumePlaceholder')}
            />
            {resumeDoc && (
              <button
                type="button"
                onClick={() => setOverridePaste(false)}
                className="mt-1 text-xs text-blue-600 hover:underline"
              >
                {t('resumeMatch.useUploadedResumeInstead', { name: resumeDoc.name })}
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => compute.mutate()}
          disabled={compute.isPending || (!usingUploadedResume && !resumeText.trim())}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {compute.isPending ? (
            <>
              <Spinner tone="white" />
              {t('resumeMatch.checkingMatch')}
            </>
          ) : (
            <>🎯 {result ? t('resumeMatch.checkAgain') : t('resumeMatch.checkMatch')}</>
          )}
        </button>

        {compute.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            <AiErrorMessage
              code={getGqlErrorCode(compute.error)}
              fallback={getErrorMessage(compute.error)}
            />
          </p>
        )}
      </Card>

      {result && color && (
        <Card className="space-y-4 p-4">
          <div
            className={`rounded-xl border border-gray-100 dark:border-gray-700 ${color.bg} flex items-center gap-3 p-3`}
          >
            <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
              <circle
                cx="26"
                cy="26"
                r={radius}
                fill="none"
                strokeWidth="5"
                className="text-gray-200 dark:text-gray-700"
                stroke="currentColor"
              />
              <circle
                cx="26"
                cy="26"
                r={radius}
                fill="none"
                strokeWidth="5"
                stroke="currentColor"
                className={color.ring}
                strokeDasharray={circumference}
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
                {result.score}
              </text>
            </svg>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {t('resumeMatch.resumeMatchTitle')}
              </p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color.badge}`}
              >
                {result.label}
              </span>
            </div>
          </div>

          {result.summary && (
            <p className="text-sm text-gray-700 dark:text-gray-300">{result.summary}</p>
          )}

          {result.matchedKeywords.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('resumeMatch.matchedKeywords')}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {result.matchedKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.missingKeywords.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('resumeMatch.missingKeywords')}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {result.missingKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
      <DocumentPreviewModal
        document={previewOpen && resumeDoc ? resumeDoc : null}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
