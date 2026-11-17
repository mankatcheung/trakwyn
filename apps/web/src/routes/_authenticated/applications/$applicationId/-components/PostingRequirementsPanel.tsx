import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, ListChecksIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { AiErrorMessage } from '#/features/ai/components/AiErrorMessage';
import { AiCreditCost } from '#/features/ai/components/AiCreditCost';
import { Spinner } from '@trakwyn/ui';
import {
  EXTRACT_POSTING_REQUIREMENTS,
  postingRequirementsQueryKey,
  postingRequirementsQueryOptions,
  type PostingRequirements,
  type PostingRequirementsData,
} from '../-postingRequirementsQueries';

interface PostingRequirementsPanelProps {
  applicationId: string;
}

function RequirementList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">{title}</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700 dark:text-gray-300">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Requirements({ requirements }: { requirements: PostingRequirements }) {
  const { t, formatDate } = useLocale();
  const { mustHave, niceToHave, keywords } = requirements;
  const isEmpty = mustHave.length + niceToHave.length + keywords.length === 0;

  return (
    <div className="mt-3 space-y-3">
      {requirements.isStale && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangleIcon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t('postingRequirements.stale')}
        </p>
      )}
      {isEmpty ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('postingRequirements.none')}</p>
      ) : (
        <>
          <RequirementList title={t('postingRequirements.mustHave')} items={mustHave} />
          <RequirementList title={t('postingRequirements.niceToHave')} items={niceToHave} />
          {keywords.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {t('postingRequirements.keywords')}
              </h4>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {keywords.map((keyword) => (
                  <li
                    key={keyword}
                    className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {keyword}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-gray-400">
        {t('postingRequirements.readOn', {
          date: formatDate(new Date(requirements.generatedAt), { dateStyle: 'medium' }),
        })}
      </p>
    </div>
  );
}

/**
 * What the posting asks for (JEF-593): must-haves, nice-to-haves and the terms
 * a screener searches for, read from the posting once with AI. A resume
 * generated for this application is tailored against the same list, so this is
 * also where the user sees what that tailoring aims at.
 *
 * Reading the page never calls AI; the button does, and generating a resume
 * does it for a posting that has not been read yet.
 */
export function PostingRequirementsPanel({ applicationId }: PostingRequirementsPanelProps) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data, isPending } = useQuery(postingRequirementsQueryOptions(applicationId));
  const requirements = data?.postingRequirements ?? null;

  const extract = useMutation({
    mutationFn: () =>
      gqlClient.request<{ extractPostingRequirements: PostingRequirements }>(
        EXTRACT_POSTING_REQUIREMENTS,
        { applicationId },
      ),
    onSuccess: ({ extractPostingRequirements }) => {
      qc.setQueryData<PostingRequirementsData>(postingRequirementsQueryKey(applicationId), {
        postingRequirements: extractPostingRequirements,
      });
    },
  });

  // Nothing until the saved list is known, so the "read it" offer never flashes
  // over a list that is about to appear.
  if (isPending) return null;

  const canRead = !requirements || requirements.isStale;

  return (
    <section
      aria-labelledby="posting-requirements-title"
      className="mt-4 rounded-xl border border-gray-100 p-3 dark:border-gray-700"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="posting-requirements-title"
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100"
        >
          <ListChecksIcon size={16} aria-hidden="true" />
          {t('postingRequirements.title')}
          {requirements?.seniority && (
            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {requirements.seniority}
            </span>
          )}
        </h3>
        {canRead && (
          <div className="flex items-center gap-2">
            <AiCreditCost feature="postingRequirements" />
            <button
              type="button"
              onClick={() => extract.mutate()}
              disabled={extract.isPending}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-blue-400 dark:hover:bg-gray-700"
            >
              {extract.isPending && <Spinner />}
              {extract.isPending
                ? t('postingRequirements.reading')
                : t(requirements ? 'postingRequirements.readAgain' : 'postingRequirements.read')}
            </button>
          </div>
        )}
      </div>

      {!requirements && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t('postingRequirements.notRead')}
        </p>
      )}
      {requirements && <Requirements requirements={requirements} />}

      {extract.isError && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          <AiErrorMessage
            code={getGqlErrorCode(extract.error)}
            fallback={getErrorMessage(extract.error)}
          />
        </p>
      )}
    </section>
  );
}
