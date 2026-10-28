import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';
import {
  UserIcon,
  ShieldIcon,
  PlugIcon,
  BellIcon,
  DatabaseIcon,
  GemIcon,
  SparklesIcon,
  AlertTriangleIcon,
} from 'lucide-react';

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const SETTINGS_NAV = [
    { to: '/settings/profile', label: t('settings.profile'), icon: UserIcon },
    { to: '/settings/security', label: t('settings.security'), icon: ShieldIcon },
    { to: '/settings/ai', label: t('settings.ai'), icon: SparklesIcon },
    { to: '/settings/integrations', label: t('settings.integrations'), icon: PlugIcon },
    { to: '/settings/notifications', label: t('settings.notifications'), icon: BellIcon },
    { to: '/settings/plan', label: t('settings.plan'), icon: GemIcon },
    { to: '/settings/data', label: t('settings.data'), icon: DatabaseIcon },
    // Last, deliberately: the only irreversible action in Settings.
    { to: '/settings/danger-zone', label: t('settings.dangerZone'), icon: AlertTriangleIcon },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('nav.settings')}
      </h1>
      <div className="flex flex-col gap-8 lg:flex-row">
        <nav className="hidden shrink-0 space-y-1 lg:block lg:w-48">
          {SETTINGS_NAV.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1">
          <div key={pathname} className="route-transition">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
