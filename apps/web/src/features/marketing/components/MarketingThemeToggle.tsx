import type { ReactNode } from 'react';
import { SunIcon, MoonIcon, MonitorIcon } from 'lucide-react';
import { IconButton } from '@trakwyn/ui';
import { useTheme, type Theme } from '#/lib/theme';
import { useLocale } from '#/lib/i18n';

/** Clicking cycles light → dark → system → light, same order as the segmented control in Settings. */
const NEXT_THEME: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };

const THEME_ICON: Record<Theme, ReactNode> = {
  light: <SunIcon size={18} />,
  dark: <MoonIcon size={18} />,
  system: <MonitorIcon size={18} />,
};

/**
 * Compact icon-only theme toggle for the marketing pages (JEF-228 follow-up)
 * — `/` and `/features/*` didn't expose the app-wide `useTheme()` state
 * anywhere before this; the actual `dark:` styling already worked, there was
 * just no control to reach it outside Settings. Cycles the same three states
 * as {@link SettingsProfilePage}'s segmented control, just icon-only to fit a
 * header.
 *
 * @category Actions
 */
export function MarketingThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLocale();

  const labels: Record<Theme, string> = {
    light: t('profile.themeLight'),
    dark: t('profile.themeDark'),
    system: t('profile.themeSystem'),
  };

  return (
    <IconButton
      label={t('profile.themeAria', { theme: labels[theme] })}
      variant="subtle"
      onClick={() => setTheme(NEXT_THEME[theme])}
      icon={
        // Keyed on `theme` so the swap-in icon replays the spin animation
        // every click, not just on first mount.
        <span key={theme} className="theme-toggle-icon">
          {THEME_ICON[theme]}
        </span>
      }
    />
  );
}
