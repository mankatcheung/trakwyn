import { useRouterState } from '@tanstack/react-router';
import { Skeleton } from '@trakwyn/ui';
import {
  BellIcon,
  BriefcaseIcon,
  CalendarIcon,
  KeyboardIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MessageCircleIcon,
  UserIcon,
} from 'lucide-react';
import { LogoMark } from '#/components/LogoMark';
import { hasSessionHint } from '#/features/auth/lib/sessionHint';
import { PagePlaceholder } from '../components/PagePlaceholder';
import { MAIN_NAV } from '../lib/navItems';
import {
  BOTTOM_NAV_CLASS,
  BRAND_CLASS,
  MAIN_CLASS,
  MOBILE_HEADER_CLASS,
  SHELL_CLASS,
  SIDER_BRAND_ROW_CLASS,
  SIDER_CLASS,
  SIDER_FOOTER_CLASS,
} from '../lib/shellClasses';

const BOTTOM_NAV = [
  { to: '/dashboard', icon: LayoutDashboardIcon },
  { to: '/applications', icon: BriefcaseIcon },
  { to: '/calendar', icon: CalendarIcon },
  { to: '/assistant', icon: MessageCircleIcon },
];

function Brand() {
  return (
    <span className={BRAND_CLASS}>
      <LogoMark size={22} />
      Trakwyn
    </span>
  );
}

function Bell() {
  return (
    // p-1.5: the real bell is 30px, and it sets the sider header's height.
    <span className="p-1.5 text-stone-400">
      <BellIcon size={18} />
    </span>
  );
}

/** One sider row: the icon, and a bar where the label will be. */
function SiderRow({ icon, active = false, to }: SiderRowProps) {
  return (
    <div
      data-nav={to}
      data-active={active}
      className={`flex h-9 items-center gap-2 rounded-lg px-3 ${
        active
          ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
          : 'text-stone-400'
      }`}
    >
      {icon}
      <Skeleton className="h-3.5 w-24 rounded-sm" />
    </div>
  );
}

interface SiderRowProps {
  icon: React.ReactNode;
  active?: boolean;
  to?: string;
}

/**
 * The signed-in frame before the app can run. `/_authenticated` is `ssr: false`,
 * so the server renders this, its `pendingComponent`, and the client keeps it up
 * until the session gate answers.
 *
 * It has no text beyond the brand and reads no theme, language or query: the
 * server knows none of them, and anything it guessed would flash or fail to
 * hydrate.
 *
 * Without the session hint it renders nothing: the guard sends that visitor to
 * /login before React hydrates, and a frame in the server HTML would then not
 * match what the client renders.
 */
export function AppShellPending() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!hasSessionHint()) return null;

  return (
    <div className={SHELL_CLASS} aria-busy="true" data-testid="app-shell-pending">
      <header className={MOBILE_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          <span className="p-2 text-stone-400">
            <MenuIcon size={18} />
          </span>
          <Brand />
        </div>
        <Bell />
      </header>

      <aside className={SIDER_CLASS}>
        <div className={SIDER_BRAND_ROW_CLASS}>
          <Brand />
          <Bell />
        </div>
        <div className="flex-1 space-y-1 overflow-hidden px-3 py-4">
          {MAIN_NAV.map((item) => (
            <SiderRow
              key={item.to}
              to={item.to}
              icon={<item.icon size={18} />}
              active={pathname.startsWith(item.to)}
            />
          ))}
        </div>
        <div className="px-3 pb-2">
          <SiderRow icon={<UserIcon size={18} />} active={pathname.startsWith('/settings')} />
        </div>
        <div className={SIDER_FOOTER_CLASS}>
          <SiderRow icon={<KeyboardIcon size={18} />} />
          <SiderRow icon={<LogOutIcon size={18} />} />
          {/* The four legal links. */}
          <div className="mt-3 flex flex-col gap-1.5 border-t border-stone-100 px-3 pt-3 dark:border-stone-700">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex h-4 items-center">
                <Skeleton className="h-2.5 w-24 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className={MAIN_CLASS}>
        <PagePlaceholder pathname={pathname} />
      </main>

      <div className={BOTTOM_NAV_CLASS} data-testid="bottom-nav-pending">
        {BOTTOM_NAV.map((item) => (
          <div key={item.to} className="flex flex-1 flex-col items-center gap-1.5 py-2">
            <item.icon
              size={20}
              className={
                pathname.startsWith(item.to) ? 'text-blue-800 dark:text-blue-400' : 'text-stone-400'
              }
            />
            <Skeleton className="h-2.5 w-10 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
