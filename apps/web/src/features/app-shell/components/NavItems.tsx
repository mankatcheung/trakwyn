import { Link } from '@tanstack/react-router';
import { UserIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';

export function AccountAvatarIcon({
  avatarUrl,
  size,
}: {
  avatarUrl: string | null | undefined;
  size: number;
}) {
  const { t } = useLocale();
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={t('authenticatedLayout.yourAvatarAlt')}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return <UserIcon size={size} />;
}

export function NavItem({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
        active
          ? 'bg-blue-50 font-medium text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

export function BottomNavItem({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
        active ? 'text-blue-800 dark:text-blue-400' : 'text-stone-500 dark:text-stone-400'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
