import { CircleCheckIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { AddLlmApiKeyForm } from '../../../settings/components/ai/AddLlmApiKeyForm';
import { LLM_API_KEYS_QUERY } from '#/features/settings/graphql/aiQueries';
import type { LlmApiKey } from '#/features/settings/lib/ai/aiTypes';
import { LLM_PROVIDER_OPTIONS } from '#/features/settings/lib/ai/llmProviders';

/**
 * The AI key step, for AI goals only: Settings → AI's own add-key form. Once
 * a key is saved the step says so instead; more keys are added in Settings.
 */
export function AiKeyStep() {
  const { t } = useLocale();
  const { data, isLoading } = useQuery({
    queryKey: ['llmApiKeys'],
    queryFn: () =>
      gqlClient.request(LLM_API_KEYS_QUERY) as Promise<{
        llmApiKeys: LlmApiKey[];
        me: { defaultLlmProvider: string | null };
      }>,
  });
  const llmApiKeys = data?.llmApiKeys ?? [];

  if (isLoading) return <Skeleton className="h-40 rounded-lg" />;

  if (llmApiKeys.length > 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
        <CircleCheckIcon size={16} className="shrink-0" />
        {t('welcome.aiKeyDone')}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/40">
      <AddLlmApiKeyForm providerOptions={LLM_PROVIDER_OPTIONS} />
    </div>
  );
}
