import type { ReactNode } from 'react';
import { SunIcon, MoonIcon, MonitorIcon } from 'lucide-react';
import { useTheme, type Theme } from '#/lib/theme';
import { useLocale } from '#/lib/i18n';

interface ThemeOption {
  value: Theme;
  labelKey: 'profile.themeLight' | 'profile.themeDark' | 'profile.themeSystem';
  icon: ReactNode;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'light', labelKey: 'profile.themeLight', icon: <SunIcon size={16} aria-hidden /> },
  { value: 'dark', labelKey: 'profile.themeDark', icon: <MoonIcon size={16} aria-hidden /> },
  {
    value: 'system',
    labelKey: 'profile.themeSystem',
    icon: <MonitorIcon size={16} aria-hidden />,
  },
];

/**
 * Light / Dark / System picker for the marketing footer (JEF-228, JEF-655).
 *
 * It started as a header icon that cycled the three states. In the footer
 * there is room for the full control, so every option is visible at once with
 * an icon and a label: the visitor sees the current choice, can pick any of
 * the three in one tap, and does not have to click through the one they do not
 * want. Same look and `aria-pressed` pattern as the segmented control in
 * {@link SettingsProfilePage}.
 *
 * @category Actions
 */
export function MarketingThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLocale();

  return (
    <div
      role="group"
      aria-label={t('profile.appearanceTitle')}
      className="inline-flex gap-1 rounded-lg border border-stone-300 p-1 dark:border-stone-700"
    >
      {THEME_OPTIONS.map((option) => {
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={selected}
            className={`flex min-h-9 items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? 'bg-blue-800 text-white'
                : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
            }`}
          >
            {option.icon}
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
