import {
  AlertTriangleIcon,
  BellIcon,
  DatabaseIcon,
  GemIcon,
  KeyRoundIcon,
  PlugIcon,
  ShieldIcon,
  UserIcon,
} from 'lucide-react';

/** The Settings section nav: read by the layout and by its server placeholder. */
export const SETTINGS_SECTIONS = [
  { to: '/settings/profile', labelKey: 'settings.profile', icon: UserIcon },
  { to: '/settings/security', labelKey: 'settings.security', icon: ShieldIcon },
  { to: '/settings/ai', labelKey: 'settings.ai', icon: KeyRoundIcon },
  { to: '/settings/integrations', labelKey: 'settings.integrations', icon: PlugIcon },
  { to: '/settings/notifications', labelKey: 'settings.notifications', icon: BellIcon },
  { to: '/settings/plan', labelKey: 'settings.plan', icon: GemIcon },
  { to: '/settings/data', labelKey: 'settings.data', icon: DatabaseIcon },
  // Last, deliberately: the only irreversible action in Settings.
  { to: '/settings/danger-zone', labelKey: 'settings.dangerZone', icon: AlertTriangleIcon },
] as const;
