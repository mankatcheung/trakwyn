import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from 'lucide-react';
import { Alert, Card, IconButton } from '@trakwyn/ui';
import { AiCreditsMeter } from '#/components/AiCreditsMeter';
import { useLocale } from '#/lib/i18n';
import {
  TRAKWYN_ENTRY,
  addEntry,
  moveEntry,
  providerEntryLabel,
  removeEntry,
  unlistedEntries,
} from './aiProviderOrder';
import { LLM_PROVIDER_AVATAR, type LlmApiKey } from './shared';

const ICON = 16;

interface AiProviderOrderCardProps {
  /** The providers that can answer, in the order they are tried. */
  order: string[];
  keys: LlmApiKey[];
  /** Whether the plan includes Trakwyn AI; `null` while billing status loads. */
  hostedAi: boolean | null;
  /** A save is in flight, or the settings are still loading. */
  busy: boolean;
  error: string | null;
  onChange: (order: string[]) => void;
}

/**
 * The one place a user says which AI answers (JEF-503): an ordered list, tried from the
 * top. If a provider fails, hits its limit or runs out of credits the next one takes
 * over, and nothing that is not in the list is ever used. It replaces the AI source
 * picker, the "make default" action and the fall-through checkbox, which were three
 * ways of saying parts of this.
 */
export function AiProviderOrderCard({
  order,
  keys,
  hostedAi,
  busy,
  error,
  onChange,
}: AiProviderOrderCardProps) {
  const { t } = useLocale();
  const unlisted = unlistedEntries(order, keys, hostedAi);

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('aiOrder.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('aiOrder.description')}</p>
      </div>

      {hostedAi === true && <AiCreditsMeter />}

      {order.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('aiOrder.empty')}</p>
      ) : (
        <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-700/60 dark:border-gray-700">
          {order.map((entry, index) => {
            const name = providerEntryLabel(entry, t);
            const avatar = entry === TRAKWYN_ENTRY ? undefined : LLM_PROVIDER_AVATAR[entry];
            return (
              <li
                key={entry}
                data-testid={`ai-order-${entry}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className="w-4 shrink-0 text-sm text-gray-400 tabular-nums"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                {avatar && (
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${avatar.className}`}
                  >
                    {avatar.initials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {entry === TRAKWYN_ENTRY
                      ? t('aiOrder.trakwynNote')
                      : t('aiOrder.keyNote', { provider: name })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <IconButton
                    label={t('aiOrder.moveUp', { name })}
                    icon={<ArrowUpIcon size={ICON} />}
                    disabled={busy || index === 0}
                    onClick={() => onChange(moveEntry(order, index, -1))}
                  />
                  <IconButton
                    label={t('aiOrder.moveDown', { name })}
                    icon={<ArrowDownIcon size={ICON} />}
                    disabled={busy || index === order.length - 1}
                    onClick={() => onChange(moveEntry(order, index, 1))}
                  />
                  <IconButton
                    label={t('aiOrder.remove', { name })}
                    icon={<XIcon size={ICON} />}
                    variant="danger"
                    disabled={busy || order.length === 1}
                    onClick={() => onChange(removeEntry(order, entry))}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {order.length === 1 && unlisted.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('aiOrder.onlyOne')}</p>
      )}

      {unlisted.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            {t('aiOrder.addTitle')}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {unlisted.map((entry) => {
              const name = providerEntryLabel(entry, t);
              return (
                <li key={entry}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onChange(addEntry(order, entry))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <PlusIcon size={14} />
                    {t('aiOrder.add', { name })}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <Alert>{error}</Alert>}
    </Card>
  );
}
