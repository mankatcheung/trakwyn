import { PlusIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { LlmApiKeyRow } from './LlmApiKeyRow';
import { AddLlmApiKeyForm } from './AddLlmApiKeyForm';
import { Alert, Button, Card, Checkbox, Skeleton, Textarea } from '@trakwyn/ui';
import {
  LLM_API_KEYS_QUERY,
  LLM_USAGE_SUMMARY_QUERY,
  DELETE_LLM_API_KEY,
  SET_DEFAULT_LLM_PROVIDER,
  SET_LLM_API_KEY_MONTHLY_LIMIT,
  TEST_LLM_API_KEY,
  UPDATE_PROFILE,
  customAiPromptSchema,
  type CustomAiPromptForm,
  type LlmApiKey,
  type LlmUsageSummary,
  type TestLlmApiKeyResult,
  LLM_PROVIDER_OPTIONS,
  extractGqlError,
} from './shared';

/**
 * Bring-your-own-key AI settings: provider keys, which provider is the
 * default, and the custom instructions appended to every prompt. The
 * target for every "add your API key" prompt scattered through the app.
 */
export function SettingsAiPage() {
  const { t } = useLocale();
  const qc = useQueryClient();

  // AI API keys
  const { data: llmData, isLoading: llmKeysLoading } = useQuery({
    queryKey: ['llmApiKeys'],
    queryFn: () =>
      gqlClient.request<{
        llmApiKeys: LlmApiKey[];
        me: {
          defaultLlmProvider: string | null;
          customAiPrompt: string | null;
          useCrossApplicationContext: boolean;
          llmFallbackWhenLimited: boolean;
        };
      }>(LLM_API_KEYS_QUERY),
  });
  const llmApiKeys = llmData?.llmApiKeys ?? [];
  const defaultLlmProvider = llmData?.me.defaultLlmProvider ?? null;

  // Usage summary (JEF-250) — separate query so a slow/failed usage lookup
  // never blocks the keys list itself from rendering.
  const { data: usageData } = useQuery({
    queryKey: ['llmUsageSummary'],
    queryFn: () =>
      gqlClient.request<{ llmUsageSummary: LlmUsageSummary[] }>(LLM_USAGE_SUMMARY_QUERY),
  });
  const usageByProvider = new Map((usageData?.llmUsageSummary ?? []).map((s) => [s.provider, s]));
  const configuredProviders = new Set(llmApiKeys.map((k) => k.provider));
  const availableProviderOptions = LLM_PROVIDER_OPTIONS.filter(
    (o) => !configuredProviders.has(o.value),
  );
  // Progressive disclosure (redesign): once at least one provider is
  // connected, the add-key form stays collapsed behind an "Add provider"
  // button rather than always sitting open — a manual toggle overrides the
  // "open when there's nothing configured yet" default in both directions.
  const [addProviderOverride, setAddProviderOverride] = useState<boolean | null>(null);
  const addProviderOpen = addProviderOverride ?? llmApiKeys.length === 0;

  const [removingProvider, setRemovingProvider] = useState<string | null>(null);
  const [llmKeyListError, setLlmKeyListError] = useState<string | null>(null);
  const onRemoveLlmApiKey = async (provider: string) => {
    setRemovingProvider(provider);
    setLlmKeyListError(null);
    try {
      await gqlClient.request(DELETE_LLM_API_KEY, { provider });
      await qc.invalidateQueries({ queryKey: ['llmApiKeys'] });
    } catch (err) {
      setLlmKeyListError(extractGqlError(err) ?? t('integrations.removeApiKeyFailed'));
    } finally {
      setRemovingProvider(null);
    }
  };

  const [settingDefaultProvider, setSettingDefaultProvider] = useState<string | null>(null);
  const onSetDefaultProvider = async (provider: string) => {
    setSettingDefaultProvider(provider);
    setLlmKeyListError(null);
    try {
      await gqlClient.request(SET_DEFAULT_LLM_PROVIDER, { provider });
      await qc.invalidateQueries({ queryKey: ['llmApiKeys'] });
    } catch (err) {
      setLlmKeyListError(extractGqlError(err) ?? t('integrations.setDefaultProviderFailed'));
    } finally {
      setSettingDefaultProvider(null);
    }
  };

  // Testing a saved key (JEF-247) — separate pending/result state per
  // provider row, so testing one key doesn't disturb another's last result.
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [savedKeyTestResults, setSavedKeyTestResults] = useState<
    Record<string, TestLlmApiKeyResult>
  >({});
  const onTestSavedLlmApiKey = async (provider: string) => {
    setTestingProvider(provider);
    setSavedKeyTestResults((prev) => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
    try {
      const data = await gqlClient.request<{ testLlmApiKey: TestLlmApiKeyResult }>(
        TEST_LLM_API_KEY,
        { provider },
      );
      setSavedKeyTestResults((prev) => ({ ...prev, [provider]: data.testLlmApiKey }));
    } catch (err) {
      setSavedKeyTestResults((prev) => ({
        ...prev,
        [provider]: { ok: false, error: extractGqlError(err) ?? t('integrations.testKeyFailed') },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  // Closing unmounts the form, which discards whatever was typed into it.
  const closeAddProviderForm = () => setAddProviderOverride(false);

  // Monthly token limits (JEF-258). Both queries are invalidated: the keys
  // query holds the ceiling, the usage query decides whether it is reached.
  const onSaveMonthlyLimit = async (provider: string, monthlyTokenLimit: number | null) => {
    await gqlClient.request(SET_LLM_API_KEY_MONTHLY_LIMIT, { provider, monthlyTokenLimit });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['llmApiKeys'] }),
      qc.invalidateQueries({ queryKey: ['llmUsageSummary'] }),
    ]);
  };

  // Custom AI prompt
  const customAiPromptForm = useForm<CustomAiPromptForm>({
    resolver: zodResolver(customAiPromptSchema),
    values: { customAiPrompt: llmData?.me.customAiPrompt ?? '' },
  });
  const onUpdateCustomAiPrompt = async (data: CustomAiPromptForm) => {
    try {
      await gqlClient.request(UPDATE_PROFILE, {
        customAiPrompt: data.customAiPrompt.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ['llmApiKeys'] });
    } catch (err) {
      customAiPromptForm.setError('root', {
        message: extractGqlError(err) ?? t('integrations.updateCustomInstructionsFailed'),
      });
    }
  };

  // Fallback when a key hits its limit (JEF-258)
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [updatingFallback, setUpdatingFallback] = useState(false);
  const onToggleFallbackWhenLimited = async (checked: boolean) => {
    setUpdatingFallback(true);
    setFallbackError(null);
    try {
      await gqlClient.request(UPDATE_PROFILE, { llmFallbackWhenLimited: checked });
      await qc.invalidateQueries({ queryKey: ['llmApiKeys'] });
    } catch (err) {
      setFallbackError(extractGqlError(err) ?? t('integrations.fallbackUpdateFailed'));
    } finally {
      setUpdatingFallback(false);
    }
  };

  // Cross-application context (JEF-249)
  const [crossAppContextError, setCrossAppContextError] = useState<string | null>(null);
  const [updatingCrossAppContext, setUpdatingCrossAppContext] = useState(false);
  const onToggleCrossApplicationContext = async (checked: boolean) => {
    setUpdatingCrossAppContext(true);
    setCrossAppContextError(null);
    try {
      await gqlClient.request(UPDATE_PROFILE, { useCrossApplicationContext: checked });
      await qc.invalidateQueries({ queryKey: ['llmApiKeys'] });
    } catch (err) {
      setCrossAppContextError(
        extractGqlError(err) ?? t('integrations.crossApplicationContextUpdateFailed'),
      );
    } finally {
      setUpdatingCrossAppContext(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-900/20">
        <div className="flex items-center gap-3">
          <SparklesIcon className="size-4.5 shrink-0 text-blue-700 dark:text-blue-400" />
          <p className="text-sm text-blue-900 dark:text-blue-300">
            {t('guides.aiMcpSetup.bannerAiText')}
          </p>
        </div>
        <Link
          to="/ai-mcp-setup"
          className="shrink-0 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
        >
          {t('guides.aiMcpSetup.bannerLink')}
        </Link>
      </div>

      {/* ── AI features ── */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('integrations.aiFeaturesTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('integrations.aiFeaturesDescription')}
          </p>
        </div>

        {llmKeyListError && (
          <div className="px-5 pt-3">
            <Alert>{llmKeyListError}</Alert>
          </div>
        )}

        {llmKeysLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
        ) : (
          <>
            {llmApiKeys.length > 0 && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-700/60">
                {llmApiKeys.map((key) => (
                  <LlmApiKeyRow
                    key={key.provider}
                    llmApiKey={key}
                    usage={usageByProvider.get(key.provider)}
                    isDefault={key.provider === defaultLlmProvider}
                    testResult={savedKeyTestResults[key.provider]}
                    busy={
                      testingProvider === key.provider ||
                      settingDefaultProvider === key.provider ||
                      removingProvider === key.provider
                    }
                    onTest={() => onTestSavedLlmApiKey(key.provider)}
                    onMakeDefault={() => onSetDefaultProvider(key.provider)}
                    onRemove={() => onRemoveLlmApiKey(key.provider)}
                    onSaveLimit={(monthlyTokenLimit) =>
                      onSaveMonthlyLimit(key.provider, monthlyTokenLimit)
                    }
                  />
                ))}
              </div>
            )}

            <div className="p-5">
              {availableProviderOptions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('integrations.allProvidersConfigured')}
                </p>
              ) : addProviderOpen ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                  {llmApiKeys.length > 0 && (
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {t('integrations.addProvider')}
                      </h3>
                      <button
                        type="button"
                        onClick={closeAddProviderForm}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  )}
                  <AddLlmApiKeyForm
                    providerOptions={availableProviderOptions}
                    onSaved={() => setAddProviderOverride(false)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddProviderOverride(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <PlusIcon size={15} />
                  {t('integrations.addProvider')}
                </button>
              )}
            </div>
          </>
        )}
      </Card>

      {/* ── Custom instructions ── */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('integrations.customInstructionsLabel')}
        </h2>
        <p className="mt-1 mb-3.5 text-sm text-gray-500 dark:text-gray-400">
          {t('integrations.customInstructionsHelp')}
        </p>
        <form onSubmit={customAiPromptForm.handleSubmit(onUpdateCustomAiPrompt)}>
          <Textarea
            {...customAiPromptForm.register('customAiPrompt')}
            invalid={!!customAiPromptForm.formState.errors.customAiPrompt}
            rows={3}
            placeholder="e.g. Keep cover letters under 200 words and write in a casual tone."
          />
          {customAiPromptForm.formState.errors.customAiPrompt && (
            <p className="mt-1 text-xs text-red-600">
              {customAiPromptForm.formState.errors.customAiPrompt.message}
            </p>
          )}
          {customAiPromptForm.formState.errors.root?.message && (
            <div className="mt-3">
              <Alert>{customAiPromptForm.formState.errors.root.message}</Alert>
            </div>
          )}
          {customAiPromptForm.formState.isSubmitSuccessful &&
            !customAiPromptForm.formState.errors.root?.message && (
              <p className="mt-3 text-sm text-green-600">
                {t('integrations.customInstructionsUpdated')}
              </p>
            )}
          <Button
            type="submit"
            disabled={customAiPromptForm.formState.isSubmitting}
            className="mt-3.5"
          >
            {customAiPromptForm.formState.isSubmitting
              ? t('applicationForm.saving')
              : t('integrations.saveInstructions')}
          </Button>
        </form>
      </Card>

      {/* ── Fallback when a key hits its limit (JEF-258) ── */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('integrations.fallbackWhenLimitedLabel')}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
              {t('integrations.fallbackWhenLimitedHelp')}
            </p>
          </div>
          <Checkbox
            id="llm-fallback-when-limited"
            aria-label={t('integrations.fallbackWhenLimitedLabel')}
            checked={llmData?.me.llmFallbackWhenLimited ?? false}
            disabled={updatingFallback}
            onChange={(e) => onToggleFallbackWhenLimited(e.target.checked)}
          />
        </div>
        {fallbackError && (
          <div className="mt-3">
            <Alert>{fallbackError}</Alert>
          </div>
        )}
      </Card>

      {/* ── Cross-application context (JEF-249) ── */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('integrations.crossApplicationContextLabel')}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
              {t('integrations.crossApplicationContextHelp')}
            </p>
          </div>
          <Checkbox
            id="use-cross-application-context"
            aria-label={t('integrations.crossApplicationContextLabel')}
            checked={llmData?.me.useCrossApplicationContext ?? false}
            disabled={updatingCrossAppContext}
            onChange={(e) => onToggleCrossApplicationContext(e.target.checked)}
          />
        </div>
        {crossAppContextError && (
          <div className="mt-3">
            <Alert>{crossAppContextError}</Alert>
          </div>
        )}
      </Card>
    </div>
  );
}
