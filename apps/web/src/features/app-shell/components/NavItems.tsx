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
  staggerIndex,
  staggerDelay,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  staggerIndex?: number;
  staggerDelay?: number;
}) {
  const delay = staggerDelay ?? (staggerIndex !== undefined ? staggerIndex * 50 : 0);

  return (
    <Link
      to={to}
      className={`sidebar-nav-item flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
        active
          ? 'bg-blue-50 font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      }`}
      style={{ animationDelay: `${delay}ms` }}
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
        active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
