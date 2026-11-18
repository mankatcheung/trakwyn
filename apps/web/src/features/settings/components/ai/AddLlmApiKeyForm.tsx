import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, FormLabel, Input, Select, SubmitButton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { SAVE_LLM_API_KEY, TEST_LLM_API_KEY } from '../../graphql/aiQueries';
import { CUSTOM_LLM_PROVIDER, llmApiKeySchema, type LlmApiKeyForm } from '../../lib/ai/aiSchemas';
import type { TestLlmApiKeyResult } from '../../lib/ai/aiTypes';
import { LLM_PROVIDER_LABEL, llmProviderDataUseUrl } from '../../lib/ai/llmProviders';
import { extractGqlError } from '../../lib/gqlErrors';

function TestResultLine({ result }: { result: TestLlmApiKeyResult }) {
  const { t } = useLocale();
  return (
    <p
      className={`mt-1 flex items-center gap-1 text-xs ${
        result.ok ? 'text-green-600' : 'text-red-600'
      }`}
    >
      {result.ok ? <CircleCheckIcon size={13} /> : <CircleAlertIcon size={13} />}
      {result.ok
        ? t('integrations.testKeySuccess')
        : (result.error ?? t('integrations.testKeyFailed'))}
    </p>
  );
}

interface AddLlmApiKeyFormProps {
  /** The providers the user has no key for yet; the first is preselected. */
  providerOptions: { value: string; label: string }[];
  /** Called once a key is saved and the `llmApiKeys` query has been refetched. */
  onSaved?: () => void;
}

/**
 * The bring-your-own-key form: provider, key, and model (plus endpoint for a
 * custom provider), with a test of the unsaved values before saving (JEF-247).
 * Shared by Settings → AI and the welcome flow's AI step (JEF-460).
 */
export function AddLlmApiKeyForm({ providerOptions, onSaved }: AddLlmApiKeyFormProps) {
  const { t } = useLocale();
  const qc = useQueryClient();

  const form = useForm<LlmApiKeyForm>({
    resolver: zodResolver(llmApiKeySchema),
    defaultValues: { provider: 'openrouter', apiKey: '', model: '', baseUrl: '' },
  });
  const provider = useWatch({ control: form.control, name: 'provider' });
  const isCustomProvider = provider === CUSTOM_LLM_PROVIDER;
  const dataUseUrl = llmProviderDataUseUrl(provider);
  const providerValues = providerOptions.map((o) => o.value).join(',');

  useEffect(() => {
    if (providerOptions.length > 0 && !providerOptions.some((o) => o.value === provider)) {
      form.setValue('provider', providerOptions[0].value as LlmApiKeyForm['provider']);
    }
  }, [providerValues, form, provider, providerOptions]);

  const save = useMutation({
    mutationFn: (data: LlmApiKeyForm) =>
      gqlClient.request(SAVE_LLM_API_KEY, {
        provider: data.provider,
        apiKey: data.apiKey,
        model: data.model?.trim() || undefined,
        baseUrl: data.baseUrl?.trim() || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llmApiKeys'] }),
  });

  const { state, formProps } = useFormAction(form, async (data) => {
    try {
      await save.mutateAsync(data);
      form.reset({ provider: data.provider, apiKey: '', model: '', baseUrl: '' });
      onSaved?.();
      return null;
    } catch (err) {
      return extractGqlError(err) ?? t('integrations.saveApiKeyFailed');
    }
  });

  // Testing the form's unsaved values, before Save (JEF-247).
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestLlmApiKeyResult | null>(null);
  const [apiKey, model, baseUrl] = useWatch({
    control: form.control,
    name: ['apiKey', 'model', 'baseUrl'],
  });
  const canTest = !!apiKey?.trim() && (!isCustomProvider || (!!model?.trim() && !!baseUrl?.trim()));
  // Editing the form after a test invalidates that result — don't leave a
  // stale "Connection works" showing against a key the user has since changed.
  useEffect(() => {
    setTestResult(null);
  }, [provider, apiKey, model, baseUrl]);
  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = (await gqlClient.request(TEST_LLM_API_KEY, {
        provider,
        apiKey,
        model: model?.trim() || undefined,
        baseUrl: baseUrl?.trim() || undefined,
      })) as { testLlmApiKey: TestLlmApiKeyResult };
      setTestResult(data.testLlmApiKey);
    } catch (err) {
      setTestResult({
        ok: false,
        error: extractGqlError(err) ?? t('integrations.testKeyFailed'),
      });
    } finally {
      setTesting(false);
    }
  };

  const errors = form.formState.errors;

  return (
    <form {...formProps} className="space-y-3">
      <div>
        <FormLabel>{t('integrations.providerLabel')}</FormLabel>
        <Select {...form.register('provider')}>
          {providerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {dataUseUrl ? (
          <a
            href={dataUseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs text-gray-500 underline"
          >
            {t('integrations.dataUseLink', {
              provider: LLM_PROVIDER_LABEL[provider] ?? provider,
            })}
          </a>
        ) : (
          isCustomProvider && (
            <p className="mt-1 text-xs text-gray-500">{t('integrations.customDataUseHint')}</p>
          )
        )}
      </div>
      <div>
        <FormLabel>{t('integrations.apiKeyLabel')}</FormLabel>
        <Input
          type="password"
          {...form.register('apiKey')}
          invalid={!!errors.apiKey}
          placeholder="sk-…"
        />
        {errors.apiKey && <p className="mt-1 text-xs text-red-600">{errors.apiKey.message}</p>}
      </div>
      {isCustomProvider ? (
        <>
          <div>
            <FormLabel>{t('integrations.baseUrlLabel')}</FormLabel>
            <Input
              type="url"
              {...form.register('baseUrl')}
              invalid={!!errors.baseUrl}
              placeholder="https://your-endpoint.example.com/v1/chat/completions"
            />
            {errors.baseUrl && (
              <p className="mt-1 text-xs text-red-600">{errors.baseUrl.message}</p>
            )}
          </div>
          <div>
            <FormLabel>{t('integrations.modelLabel')}</FormLabel>
            <Input
              type="text"
              {...form.register('model')}
              invalid={!!errors.model}
              placeholder="e.g. gpt-4o-mini"
            />
            {errors.model && <p className="mt-1 text-xs text-red-600">{errors.model.message}</p>}
          </div>
        </>
      ) : (
        <div>
          <FormLabel>
            {t('integrations.modelLabel')}{' '}
            <span className="font-normal text-gray-400">
              ({t('integrations.modelOptionalNote')})
            </span>
          </FormLabel>
          <Input
            type="text"
            {...form.register('model')}
            placeholder={t('integrations.providerDefaultPlaceholder')}
          />
        </div>
      )}
      {state.error && <Alert>{state.error}</Alert>}
      {testResult && <TestResultLine result={testResult} />}
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel={t('applicationForm.saving')}>
          {t('integrations.addKey')}
        </SubmitButton>
        <Button type="button" variant="secondary" onClick={onTest} disabled={!canTest || testing}>
          {testing ? t('integrations.testingKey') : t('integrations.testKey')}
        </Button>
      </div>
    </form>
  );
}
