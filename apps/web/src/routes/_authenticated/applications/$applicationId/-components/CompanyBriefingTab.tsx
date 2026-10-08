import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { Markdown } from '#/components/Markdown';
import { useLocale } from '#/lib/i18n';
import { Button, Card, Spinner } from '@trakwyn/ui';

const BRIEFING_FIELDS = `id applicationId content generatedAt`;

const COMPANY_BRIEFING_QUERY = `
  query CompanyBriefing($applicationId: ID!) {
    companyBriefing(applicationId: $applicationId) { ${BRIEFING_FIELDS} }
  }
`;

const GENERATE_COMPANY_BRIEFING = `
  mutation GenerateCompanyBriefing($applicationId: ID!) {
    generateCompanyBriefing(applicationId: $applicationId) { ${BRIEFING_FIELDS} }
  }
`;

type Briefing = { id: string; applicationId: string; content: string; generatedAt: string };

export function CompanyBriefingTab({ applicationId }: { applicationId: string }) {
  const { t, formatDate } = useLocale();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const queryKey = ['companyBriefing', applicationId] as const;

  // Read from the server rather than remembering the last generation in
  // component state: the briefing is stored now, so leaving the tab no longer
  // means paying to produce it again.
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      gqlClient.request<{ companyBriefing: Briefing | null }>(COMPANY_BRIEFING_QUERY, {
        applicationId,
      }),
  });
  const briefing = data?.companyBriefing ?? null;

  const generate = useMutation({
    mutationFn: () =>
      gqlClient.request<{ generateCompanyBriefing: Briefing }>(GENERATE_COMPANY_BRIEFING, {
        applicationId,
      }),
    onSuccess: (result) => {
      qc.setQueryData(queryKey, { companyBriefing: result.generateCompanyBriefing });
      setCopied(false);
    },
  });

  const handleGenerate = () => {
    // Regenerating overwrites the stored briefing and there is no undo, so an
    // existing one is confirmed before it is replaced.
    if (briefing && !confirm(t('companyBriefing.regenerateConfirm'))) return;
    generate.mutate();
  };

  const handleCopy = () => {
    if (!briefing) return;
    void navigator.clipboard.writeText(briefing.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('companyBriefing.description')}
        </p>
        <Button onClick={handleGenerate} disabled={generate.isPending || isLoading}>
          <span className="flex items-center gap-2">
            {generate.isPending ? (
              <>
                <Spinner tone="white" />
                {t('companyBriefing.researching')}
              </>
            ) : (
              <>
                ✨{' '}
                {briefing ? t('companyBriefing.regenerate') : t('companyBriefing.generateBriefing')}
              </>
            )}
          </span>
        </Button>
        {generate.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            <AiErrorMessage
              code={getGqlErrorCode(generate.error)}
              fallback={(generate.error as Error).message}
            />
          </p>
        )}
      </Card>

      {briefing && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('companyBriefing.title')}
              </h3>
              <p className="text-xs text-gray-400">
                {t('companyBriefing.generatedAt', {
                  date: formatDate(new Date(briefing.generatedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              aria-label={t('common.copy')}
            >
              <span className="flex items-center gap-1">
                <CopyIcon size={14} />{' '}
                <span className="hidden sm:inline">
                  {copied ? t('companyBriefing.copied') : t('common.copy')}
                </span>
              </span>
            </Button>
          </div>
          <p className="text-xs text-gray-400">{t('companyBriefing.disclaimer')}</p>
          {/* Briefings stored before markdown were "Header:\nbody" with single
              newlines, which markdown folds into one run-on line. */}
          <div className="text-gray-800 dark:text-gray-200 [&_p]:whitespace-pre-line">
            <Markdown content={briefing.content} />
          </div>
        </Card>
      )}
    </div>
  );
}
