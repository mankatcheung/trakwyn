import { useState } from 'react';
import { EllipsisVerticalIcon, PencilIcon, StarIcon, Trash2Icon, ZapIcon } from 'lucide-react';
import { Alert, Button, Input, Menu, type MenuItem } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import {
  LLM_PROVIDER_AVATAR,
  LLM_PROVIDER_LABEL,
  type LlmApiKey,
  type LlmUsageSummary,
  type TestLlmApiKeyResult,
} from './shared';

/** Above this share of the limit the meter warns rather than just reports. */
const NEARING_LIMIT_RATIO = 0.8;

const ICON = 16;

export interface LlmApiKeyRowProps {
  llmApiKey: LlmApiKey;
  usage?: LlmUsageSummary;
  isDefault: boolean;
  testResult?: TestLlmApiKeyResult;
  busy?: boolean;
  onTest: () => void;
  onMakeDefault: () => void;
  onRemove: () => void;
  onSaveLimit: (monthlyTokenLimit: number | null) => Promise<void>;
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
  isDefault,
  testResult,
  busy = false,
  onTest,
  onMakeDefault,
  onRemove,
  onSaveLimit,
}: LlmApiKeyRowProps) {
  const { t, formatNumber } = useLocale();
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
    ...(isDefault
      ? []
      : [
          {
            id: 'default',
            label: t('integrations.makeDefault'),
            icon: <StarIcon size={ICON} />,
          },
        ]),
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
    else if (id === 'default') onMakeDefault();
    else if (id === 'remove') onRemove();
  };

  return (
    <div
      data-testid={`llm-provider-row-${llmApiKey.provider}`}
      className={`border-b border-gray-100 px-5 py-4 last:border-b-0 dark:border-gray-700/60 ${
        reached ? 'bg-red-50 dark:bg-red-900/10' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {avatar && (
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${avatar.className} ${
                reached ? 'opacity-60' : ''
              }`}
            >
              {avatar.initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {LLM_PROVIDER_LABEL[llmApiKey.provider] ?? llmApiKey.provider}
              {isDefault && (
                <span className="ml-2 text-xs font-normal text-green-600">
                  {t('integrations.default')}
                </span>
              )}
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
              <p className="text-xs break-all text-gray-500 dark:text-gray-400">
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
                  className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                >
                  <div
                    className={`h-full rounded-full transition-all ${
                      reached ? 'bg-red-600' : nearing ? 'bg-amber-500' : 'bg-blue-600'
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
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
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
                    date: new Date(usage.lastUsedAt).toLocaleDateString(),
                  }),
                ].join(' · ')}
              </p>
            )}

            {reached && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-400">
                {t('integrations.limitReachedRow', { date: nextResetLabel() })}
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
                className="flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <EllipsisVerticalIcon size={ICON} />
              </button>
            )}
          />
        </div>
      </div>

      {editing && (
        <LimitEditor
          currentLimit={limit}
          used={used}
          atCeiling={reached}
          onCancel={() => setEditing(false)}
          onSave={async (value) => {
            await onSaveLimit(value);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

/** The 1st of next month, which is when the allowance refills. */
function nextResetLabel(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString();
}

interface LimitEditorProps {
  currentLimit: number | null;
  used: number;
  atCeiling: boolean;
  onCancel: () => void;
  onSave: (monthlyTokenLimit: number | null) => Promise<void>;
}

const PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000];

function LimitEditor({ currentLimit, used, atCeiling, onCancel, onSave }: LimitEditorProps) {
  const { t, formatNumber } = useLocale();
  const [value, setValue] = useState(currentLimit === null ? '' : String(currentLimit));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (raw: string) => {
    // An empty field means "no limit" — the same thing the No limit preset
    // sends, so clearing does not need its own button.
    const trimmed = raw.replace(/[\s,]/g, '');
    if (trimmed === '') return persist(null);

    if (!/^\d+$/.test(trimmed)) return setError(t('integrations.limitMustBeWholeNumber'));
    const parsed = Number(trimmed);
    if (parsed < 1) return setError(t('integrations.limitMustBePositive'));
    return persist(parsed);
  };

  const persist = async (limit: number | null) => {
    setError(null);
    setSaving(true);
    try {
      await onSave(limit);
    } catch {
      setError(t('integrations.limitUpdateFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`mt-3 ml-0 rounded-lg border p-4 sm:ml-12 ${
        atCeiling
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20'
          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40'
      }`}
    >
      {atCeiling && (
        <p className="mb-3 text-xs text-red-700 dark:text-red-400">
          {t('integrations.limitAtCeiling', { limit: formatNumber(currentLimit ?? 0) })}
        </p>
      )}

      <label
        htmlFor="monthly-token-limit"
        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        {t('integrations.monthlyLimitLabel')}
      </label>
      <Input
        id="monthly-token-limit"
        value={value}
        inputMode="numeric"
        onChange={(event) => setValue(event.target.value)}
        className="max-w-[200px]"
      />

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setValue(String(preset))}
            className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {formatNumber(preset)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setValue('')}
          className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {t('integrations.removeLimit')}
        </button>
      </div>

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {t('integrations.limitHelp')}{' '}
        {t('integrations.limitUsedSoFar', { used: formatNumber(used) })}
      </p>

      {error && <Alert className="mt-3">{error}</Alert>}

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" disabled={saving} onClick={() => void submit(value)}>
          {atCeiling ? t('integrations.raiseLimitAndResume') : t('integrations.saveLimit')}
        </Button>
        <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          {t('integrations.cancelLimit')}
        </Button>
      </div>
    </div>
  );
}
