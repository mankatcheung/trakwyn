import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, FormLabel, Input, Select } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import {
  CUSTOM_LLM_PROVIDER,
  SAVE_LLM_API_KEY,
  TEST_LLM_API_KEY,
  extractGqlError,
  llmApiKeySchema,
  type LlmApiKeyForm,
  type TestLlmApiKeyResult,
} from './shared';

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
  const provider = form.watch('provider');
  const isCustomProvider = provider === CUSTOM_LLM_PROVIDER;
  const providerValues = providerOptions.map((o) => o.value).join(',');

  useEffect(() => {
    if (providerOptions.length > 0 && !providerOptions.some((o) => o.value === provider)) {
      form.setValue('provider', providerOptions[0].value as LlmApiKeyForm['provider']);
    }
  }, [providerValues, form, provider, providerOptions]);

  const onSave = async (data: LlmApiKeyForm) => {
    try {
      await gqlClient.request(SAVE_LLM_API_KEY, {
        provider: data.provider,
        apiKey: data.apiKey,
        model: data.model?.trim() || undefined,
        baseUrl: data.baseUrl?.trim() || undefined,
      });
      form.reset({ provider: data.provider, apiKey: '', model: '', baseUrl: '' });
      await qc.invalidateQueries({ queryKey: ['llmApiKeys'] });
      onSaved?.();
    } catch (err) {
      form.setError('root', {
        message: extractGqlError(err) ?? t('integrations.saveApiKeyFailed'),
      });
    }
  };

  // Testing the form's unsaved values, before Save (JEF-247).
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestLlmApiKeyResult | null>(null);
  const [apiKey, model, baseUrl] = form.watch(['apiKey', 'model', 'baseUrl']);
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
      const data = await gqlClient.request<{ testLlmApiKey: TestLlmApiKeyResult }>(
        TEST_LLM_API_KEY,
        {
          provider,
          apiKey,
          model: model?.trim() || undefined,
          baseUrl: baseUrl?.trim() || undefined,
        },
      );
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
    <form onSubmit={form.handleSubmit(onSave)} className="space-y-3">
      <div>
        <FormLabel>{t('integrations.providerLabel')}</FormLabel>
        <Select {...form.register('provider')}>
          {providerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
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
      {errors.root && <Alert>{errors.root.message}</Alert>}
      {testResult && <TestResultLine result={testResult} />}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('applicationForm.saving') : t('integrations.addKey')}
        </Button>
        <Button type="button" variant="secondary" onClick={onTest} disabled={!canTest || testing}>
          {testing ? t('integrations.testingKey') : t('integrations.testKey')}
        </Button>
      </div>
    </form>
  );
}
