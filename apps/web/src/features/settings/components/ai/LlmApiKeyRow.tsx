import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EllipsisVerticalIcon, PencilIcon, Trash2Icon, ZapIcon } from 'lucide-react';
import { Alert, Button, Input, Menu, SubmitButton, type MenuItem } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useDates } from '#/hooks/useDates';
import { useFormAction } from '#/hooks/useFormAction';
import { SET_LLM_API_KEY_MONTHLY_LIMIT } from '../../graphql/aiQueries';
import type { LlmApiKey, LlmUsageSummary, TestLlmApiKeyResult } from '../../lib/ai/aiTypes';
import { LLM_PROVIDER_AVATAR, LLM_PROVIDER_LABEL } from '../../lib/ai/llmProviders';

/** Above this share of the limit the meter warns rather than just reports. */
const NEARING_LIMIT_RATIO = 0.8;

const ICON = 16;

export interface LlmApiKeyRowProps {
  llmApiKey: LlmApiKey;
  usage?: LlmUsageSummary;
  testResult?: TestLlmApiKeyResult;
  busy?: boolean;
  onTest: () => void;
  onRemove: () => void;
}

/**
 * One configured provider key: what it is, what it has spent this month
 * against its ceiling, and the actions available on it (JEF-258).
 *
 * Split out of `SettingsAiPage` when the limit UI landed — the row grew a
 * meter, three states and an inline editor, and the page was already 616
 * lines.
 *
 * The actions are a `Menu` rather than the previous row of text links. There
 * were four of them, and the page hid their labels below `sm`, so a phone
 * showed four unlabelled icons side by side. The one exception is a paused
 * key: "Raise limit" stays a visible button, because burying the single
 * action that fixes the problem behind a menu is the wrong place to save
 * space.
 */
export function LlmApiKeyRow({
  llmApiKey,
  usage,
  testResult,
  busy = false,
  onTest,
  onRemove,
}: LlmApiKeyRowProps) {
  const { t, formatNumber } = useLocale();
  const dates = useDates();
  const [editing, setEditing] = useState(false);

  const avatar = LLM_PROVIDER_AVATAR[llmApiKey.provider];
  const limit = llmApiKey.monthlyTokenLimit ?? null;
  const used = usage ? usage.promptTokens + usage.completionTokens : 0;
  const reached = usage?.limitReached ?? false;
  const ratio = limit && limit > 0 ? Math.min(1, used / limit) : 0;
  const nearing = limit !== null && !reached && ratio >= NEARING_LIMIT_RATIO;

  const menuItems: MenuItem[] = [
    {
      id: 'limit',
      label: limit === null ? t('integrations.setLimit') : t('integrations.editLimit'),
      icon: <PencilIcon size={ICON} />,
    },
    { id: 'test', label: t('integrations.testKey'), icon: <ZapIcon size={ICON} /> },
    {
      id: 'remove',
      label: t('integrations.remove'),
      icon: <Trash2Icon size={ICON} />,
      destructive: true,
      separated: true,
    },
  ];

  const onSelect = (id: string) => {
    if (id === 'limit') setEditing(true);
    else if (id === 'test') onTest();
    else if (id === 'remove') onRemove();
  };

  return (
    <div
      data-testid={`llm-provider-row-${llmApiKey.provider}`}
      className={`border-b border-stone-100 px-5 py-4 last:border-b-0 dark:border-stone-700/60 ${
        reached ? 'bg-red-50 dark:bg-red-900/10' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {avatar && (
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-medium ${avatar.className} ${
                reached ? 'opacity-60' : ''
              }`}
            >
              {avatar.initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
              {LLM_PROVIDER_LABEL[llmApiKey.provider] ?? llmApiKey.provider}
              {reached && (
                <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {t('integrations.limitPaused')}
                </span>
              )}
              {nearing && (
                <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  {t('integrations.limitPercentUsed', { percent: Math.round(ratio * 100) })}
                </span>
              )}
            </p>
            {(llmApiKey.model || llmApiKey.baseUrl) && (
              <p className="text-xs break-all text-stone-500 dark:text-stone-400">
                {[llmApiKey.model, llmApiKey.baseUrl].filter(Boolean).join(' · ')}
              </p>
            )}

            {limit !== null && (
              <div className="mt-2 max-w-[340px]">
                <div
                  role="progressbar"
                  aria-valuenow={used}
                  aria-valuemin={0}
                  aria-valuemax={limit}
                  aria-label={t('integrations.monthlyLimitLabel')}
                  className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700"
                >
                  <div
                    className={`h-full rounded-full transition-[width] ${
                      reached
                        ? 'bg-red-600'
                        : nearing
                          ? 'bg-amber-500'
                          : 'bg-blue-800 dark:bg-blue-600'
                    }`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/*
              The usage line JEF-250 shipped, unchanged when no limit is set.
              With a limit, the token count becomes "used of limit" so the
              meter has a caption — but the request count and last-used date
              stay either way, rather than being traded for the meter.
            */}
            {usage && (
              <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                {[
                  limit === null
                    ? t('integrations.usageThisMonth')
                    : t('integrations.limitUsage', {
                        used: formatNumber(used),
                        limit: formatNumber(limit),
                      }),
                  t('integrations.usageRequests', { count: usage.requestCount }),
                  // Only when the provider reports a cache split at all —
                  // a 0% for a provider that never says would be misleading.
                  ...(usage.cacheReadTokens + usage.cacheWriteTokens > 0 && usage.promptTokens > 0
                    ? [
                        t('integrations.usageCacheHits', {
                          rate: Math.round((100 * usage.cacheReadTokens) / usage.promptTokens),
                        }),
                      ]
                    : []),
                  ...(limit === null
                    ? [t('integrations.usageTokens', { count: formatNumber(used) })]
                    : []),
                  t('integrations.usageLastUsed', {
                    date: dates.day(usage.lastUsedAt),
                  }),
                ].join(' · ')}
              </p>
            )}

            {reached && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-400">
                {t('integrations.limitReachedRow', { date: dates.day(nextResetDate()) })}
              </p>
            )}

            {testResult && (
              <p
                className={`mt-1 text-xs ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}
                data-testid={`llm-test-result-${llmApiKey.provider}`}
              >
                {testResult.ok
                  ? t('integrations.testKeySuccess')
                  : (testResult.error ?? t('integrations.testKeyFailed'))}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {reached && !editing && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {t('integrations.raiseLimit')}
            </Button>
          )}
          <Menu
            label={t('integrations.keyActions')}
            items={menuItems}
            onSelect={onSelect}
            trigger={(triggerProps) => (
              <button
                type="button"
                {...triggerProps}
                disabled={busy}
                aria-label={t('integrations.keyActions')}
                className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-60 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                <EllipsisVerticalIcon size={ICON} />
              </button>
            )}
          />
        </div>
      </div>

      {editing && (
        <LimitEditor
          provider={llmApiKey.provider}
          currentLimit={limit}
          used={used}
          atCeiling={reached}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/** The 1st of next month, which is when the allowance refills. */
function nextResetDate(): Date {
  const now = new Date();
  return new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

interface LimitEditorProps {
  provider: string;
  currentLimit: number | null;
  used: number;
  atCeiling: boolean;
  onCancel: () => void;
  /** Called once the limit is saved and the keys and usage queries are refetched. */
  onSaved: () => void;
}

const PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000];

/** "1,000,000" and "1 000 000" both read as a million. */
const stripSeparators = (raw: string) => raw.replace(/[\s,]/g, '');

/** An empty field means "no limit", the same thing the No limit preset sends. */
const limitSchema = (t: ReturnType<typeof useLocale>['t']) =>
  z.object({
    limit: z.string().superRefine((raw, ctx) => {
      const digits = stripSeparators(raw);
      if (digits === '') return;
      if (!/^\d+$/.test(digits)) {
        ctx.addIssue({ code: 'custom', message: t('integrations.limitMustBeWholeNumber') });
      } else if (Number(digits) < 1) {
        ctx.addIssue({ code: 'custom', message: t('integrations.limitMustBePositive') });
      }
    }),
  });

type LimitFormValues = z.infer<ReturnType<typeof limitSchema>>;

function LimitEditor({
  provider,
  currentLimit,
  used,
  atCeiling,
  onCancel,
  onSaved,
}: LimitEditorProps) {
  const { t, formatNumber } = useLocale();
  const qc = useQueryClient();
  const form = useForm<LimitFormValues>({
    resolver: zodResolver(limitSchema(t)),
    defaultValues: { limit: currentLimit === null ? '' : String(currentLimit) },
  });

  // Both queries are invalidated: the keys query holds the ceiling, the usage
  // query decides whether it is reached (JEF-258).
  const save = useMutation({
    mutationFn: (monthlyTokenLimit: number | null) =>
      gqlClient.request(SET_LLM_API_KEY_MONTHLY_LIMIT, { provider, monthlyTokenLimit }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['llmApiKeys'] }),
        qc.invalidateQueries({ queryKey: ['llmUsageSummary'] }),
      ]),
  });

  const { state, formProps } = useFormAction(form, async ({ limit }) => {
    const digits = stripSeparators(limit);
    try {
      await save.mutateAsync(digits === '' ? null : Number(digits));
      onSaved();
      return null;
    } catch {
      return t('integrations.limitUpdateFailed');
    }
  });
  const error = form.formState.errors.limit?.message ?? state.error;

  return (
    <form
      {...formProps}
      className={`mt-3 ml-0 rounded-lg border p-4 sm:ml-12 ${
        atCeiling
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20'
          : 'border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/40'
      }`}
    >
      {atCeiling && (
        <p className="mb-3 text-xs text-red-700 dark:text-red-400">
          {t('integrations.limitAtCeiling', { limit: formatNumber(currentLimit ?? 0) })}
        </p>
      )}

      <label
        htmlFor="monthly-token-limit"
        className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-200"
      >
        {t('integrations.monthlyLimitLabel')}
      </label>
      <Input
        id="monthly-token-limit"
        inputMode="numeric"
        {...form.register('limit')}
        className="max-w-[200px]"
      />

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => form.setValue('limit', String(preset))}
            className="rounded-full border border-stone-300 px-2.5 py-1 text-xs text-stone-700 hover:bg-white dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            {formatNumber(preset)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => form.setValue('limit', '')}
          className="rounded-full border border-stone-300 px-2.5 py-1 text-xs text-stone-700 hover:bg-white dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          {t('integrations.removeLimit')}
        </button>
      </div>

      <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
        {t('integrations.limitHelp')}{' '}
        {t('integrations.limitUsedSoFar', { used: formatNumber(used) })}
      </p>

      {error && <Alert className="mt-3">{error}</Alert>}

      <div className="mt-4 flex items-center gap-2">
        <SubmitButton size="sm" pendingLabel={t('applicationForm.saving')}>
          {atCeiling ? t('integrations.raiseLimitAndResume') : t('integrations.saveLimit')}
        </SubmitButton>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={save.isPending}
          onClick={onCancel}
        >
          {t('integrations.cancelLimit')}
        </Button>
      </div>
    </form>
  );
}
