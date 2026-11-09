import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { Markdown } from '#/components/Markdown';
import { useLocale } from '#/lib/i18n';
import { invalidateSectionCounts } from '../-sectionCounts';
import { Button, Card } from '@trakwyn/ui';
import { AiActionBar } from '#/components/ai/AiActionBar';
import { AiPromptInput } from '#/components/ai/AiPromptInput';

const BRIEFING_FIELDS = `id applicationId content sources { url title } generatedAt`;

const COMPANY_BRIEFING_QUERY = `
  query CompanyBriefing($applicationId: ID!) {
    companyBriefing(applicationId: $applicationId) { ${BRIEFING_FIELDS} }
  }
`;

const GENERATE_COMPANY_BRIEFING = `
  mutation GenerateCompanyBriefing($applicationId: ID!, $instructions: String) {
    generateCompanyBriefing(applicationId: $applicationId, instructions: $instructions) { ${BRIEFING_FIELDS} }
  }
`;

const BRIEFING_EXAMPLES = [
  'aiHelper.briefingExample1',
  'aiHelper.briefingExample2',
  'aiHelper.briefingExample3',
] as const;

type Briefing = {
  id: string;
  applicationId: string;
  content: string;
  sources: Array<{ url: string; title: string }>;
  generatedAt: string;
};

/** Only a web address becomes a link: a stored value is never trusted to be a safe `href`. */
const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

export function CompanyBriefingTab({ applicationId }: { applicationId: string }) {
  const { t, formatDate } = useLocale();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [instructions, setInstructions] = useState('');

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
  const sources = briefing?.sources ?? [];

  const generate = useMutation({
    mutationFn: () =>
      gqlClient.request<{ generateCompanyBriefing: Briefing }>(GENERATE_COMPANY_BRIEFING, {
        applicationId,
        instructions: instructions.trim() || null,
      }),
    onSuccess: (result) => {
      qc.setQueryData(queryKey, { companyBriefing: result.generateCompanyBriefing });
      setCopied(false);
      // The section index's generated marker is its own cache entry.
      void invalidateSectionCounts(qc, applicationId);
    },
  });

  const handleGenerate = async () => {
    // Regenerating overwrites the stored briefing and there is no undo, so an
    // existing one is confirmed before it is replaced.
    if (briefing && !confirm(t('companyBriefing.regenerateConfirm'))) return;
    await generate.mutateAsync();
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
        <AiActionBar
          feature="companyBriefing"
          onRun={handleGenerate}
          label={`✨ ${briefing ? t('companyBriefing.regenerate') : t('companyBriefing.generateBriefing')}`}
          loadingLabel={t('companyBriefing.researching')}
          loading={generate.isPending}
          disabled={isLoading}
        >
          <AiPromptInput
            value={instructions}
            onChange={setInstructions}
            disabled={generate.isPending}
            placeholderExamples={BRIEFING_EXAMPLES.map((key) => t(key))}
          />
        </AiActionBar>
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
          <p className="text-xs text-gray-400">
            {t(
              sources.length > 0
                ? 'companyBriefing.disclaimerWithSources'
                : 'companyBriefing.disclaimer',
            )}
          </p>
          {/* Briefings stored before markdown were "Header:\nbody" with single
              newlines, which markdown folds into one run-on line. */}
          <div className="text-gray-800 dark:text-gray-200 [&_p]:whitespace-pre-line">
            <Markdown content={briefing.content} />
          </div>
          {sources.length > 0 && (
            <div data-testid="briefing-sources">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('companyBriefing.sources')}
              </h4>
              {/* Numbered to match the [1], [2] the briefing cites. */}
              <ol className="mt-1 space-y-0.5 text-sm">
                {sources.map((source, index) => (
                  <li key={source.url} className="flex gap-1.5">
                    <span className="text-gray-400">[{index + 1}]</span>
                    {isWebUrl(source.url) ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {source.title}
                      </a>
                    ) : (
                      <span className="truncate">{source.title}</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
