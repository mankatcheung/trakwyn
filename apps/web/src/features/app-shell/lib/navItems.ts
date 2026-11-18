import {
  AlertTriangleIcon,
  BarChart2Icon,
  BellIcon,
  BriefcaseIcon,
  CalendarIcon,
  DatabaseIcon,
  GitCompareArrowsIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  MessageCircleIcon,
  PlugIcon,
  ShieldIcon,
  SparklesIcon,
  UserIcon,
} from 'lucide-react';

export const SETTINGS_NAV = [
  { to: '/settings/profile', labelKey: 'settings.profile', icon: UserIcon },
  { to: '/settings/security', labelKey: 'settings.security', icon: ShieldIcon },
  { to: '/settings/ai', labelKey: 'settings.ai', icon: SparklesIcon },
  { to: '/settings/integrations', labelKey: 'settings.integrations', icon: PlugIcon },
  { to: '/settings/notifications', labelKey: 'settings.notifications', icon: BellIcon },
  { to: '/settings/data', labelKey: 'settings.data', icon: DatabaseIcon },
  // Last, deliberately: the only irreversible action in Settings.
  { to: '/settings/danger-zone', labelKey: 'settings.dangerZone', icon: AlertTriangleIcon },
] as const;

export const MAIN_NAV = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboardIcon },
  { to: '/applications', labelKey: 'nav.applications', icon: BriefcaseIcon },
  { to: '/profile', labelKey: 'nav.profile', icon: IdCardIcon },
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarIcon },
  { to: '/offers', labelKey: 'nav.offers', icon: GitCompareArrowsIcon },
  { to: '/analytics', labelKey: 'nav.analytics', icon: BarChart2Icon },
  { to: '/assistant', labelKey: 'nav.assistant', icon: MessageCircleIcon },
] as const;
