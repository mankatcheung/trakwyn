import { useLocale } from '#/lib/i18n';

export type AiSource = 'auto' | 'trakwyn' | 'own';

const OPTIONS: ReadonlyArray<{ value: AiSource; label: string; help: string }> = [
  { value: 'auto', label: 'aiSource.auto', help: 'aiSource.autoHelp' },
  { value: 'trakwyn', label: 'aiSource.trakwyn', help: 'aiSource.trakwynHelp' },
  { value: 'own', label: 'aiSource.own', help: 'aiSource.ownHelp' },
];

interface AiSourcePickerProps {
  value: AiSource;
  /** "My own key" needs one; without it the option is disabled and says why. */
  hasOwnKey: boolean;
  disabled?: boolean;
  onChange: (source: AiSource) => void;
}

/** Auto / Trakwyn AI / own key (JEF-451), saved with `setAiSource`. */
export function AiSourcePicker({ value, hasOwnKey, disabled, onChange }: AiSourcePickerProps) {
  const { t } = useLocale();
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">{t('aiSource.title')}</legend>
      {OPTIONS.map((option) => {
        const unavailable = option.value === 'own' && !hasOwnKey;
        return (
          <label
            key={option.value}
            className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
              value === option.value
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700'
            } ${unavailable ? 'opacity-60' : 'cursor-pointer'}`}
          >
            <input
              type="radio"
              name="ai-source"
              className="mt-1"
              value={option.value}
              checked={value === option.value}
              disabled={unavailable}
              onChange={() => onChange(option.value)}
            />
            <span>
              <span className="block font-medium text-gray-900 dark:text-gray-100">
                {t(option.label)}
              </span>
              <span className="block text-gray-500 dark:text-gray-400">
                {unavailable ? t('aiSource.ownNeedsKey') : t(option.help)}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
