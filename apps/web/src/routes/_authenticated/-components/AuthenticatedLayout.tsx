import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Outlet, useChildMatches, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';
import { useHotkeys, getKeyModifier } from '#/hooks/useHotkeys';
import { CommandPalette } from '#/components/CommandPalette';
import { ShortcutCheatSheet } from '#/components/ShortcutCheatSheet';
import { LogoMark } from '#/components/LogoMark';
import { LegalFooterLinks } from '#/components/LegalFooterLinks';
import { ChatDockProvider } from '#/lib/chatDock';
import { ChatDockFooter } from '../-chat-dock-footer';
import { ChatDockFloatingWindow } from '../-chat-dock-floating-window';
import { NotificationInboxButton, NotificationInboxLink } from '../-notification-inbox';
import { AssistantNavConversations } from './AssistantNavConversations';
import { useLocale } from '#/lib/i18n';
import {
  BarChart2Icon,
  BriefcaseIcon,
  CalendarIcon,
  GitCompareArrowsIcon,
  KeyboardIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MessageCircleIcon,
  PlugIcon,
  BellIcon,
  DatabaseIcon,
  ShieldIcon,
  SparklesIcon,
  AlertTriangleIcon,
  UserIcon,
  XIcon,
} from 'lucide-react';

const LOGOUT_MUTATION = `mutation { logout }`;
const AVATAR_QUERY = `query AccountAvatar { me { avatarUrl } }`;

const SETTINGS_NAV = [
  { to: '/settings/profile', labelKey: 'settings.profile', icon: UserIcon },
  { to: '/settings/experience', labelKey: 'settings.experience', icon: BriefcaseIcon },
  { to: '/settings/security', labelKey: 'settings.security', icon: ShieldIcon },
  { to: '/settings/ai', labelKey: 'settings.ai', icon: SparklesIcon },
  { to: '/settings/integrations', labelKey: 'settings.integrations', icon: PlugIcon },
  { to: '/settings/notifications', labelKey: 'settings.notifications', icon: BellIcon },
  { to: '/settings/data', labelKey: 'settings.data', icon: DatabaseIcon },
  // Last, deliberately: the only irreversible action in Settings.
  { to: '/settings/danger-zone', labelKey: 'settings.dangerZone', icon: AlertTriangleIcon },
] as const;

const MAIN_NAV = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboardIcon },
  { to: '/applications', labelKey: 'nav.applications', icon: BriefcaseIcon },
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarIcon },
  { to: '/offers', labelKey: 'nav.offers', icon: GitCompareArrowsIcon },
  { to: '/analytics', labelKey: 'nav.analytics', icon: BarChart2Icon },
  { to: '/assistant', labelKey: 'nav.assistant', icon: MessageCircleIcon },
] as const;

export function AuthenticatedLayout() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({
    select: (s) => s.location.search as { conversation?: string },
  });
  const inAssistantSection = pathname.startsWith('/assistant');
  // Routes that are a fixed-height pane rather than a document: they fill the
  // space main leaves and scroll something inside themselves — the chat and
  // the applications board. /assistant/history and the applications list are
  // ordinary scrolling lists, so both matches are exact. See the wrapper
  // below for why this is opt-in.
  const fillsViewport =
    pathname.replace(/\/$/, '') === '/assistant' || pathname === '/applications/board';
  // Keyed by the immediate child route (dashboard/applications/settings/…)
  // rather than the full pathname, so switching between nested settings tabs
  // doesn't also remount the settings layout's own sub-nav.
  const sectionKey = useChildMatches()[0]?.routeId ?? pathname;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const sidebarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSidebar = useCallback(() => {
    setSidebarVisible(true);
    // Force a frame so the browser renders the element at opacity-0 before transitioning
    requestAnimationFrame(() => {
      setSidebarOpen(true);
    });
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    // Wait for the transition to complete before removing from DOM
    const prevTimer = sidebarTimerRef.current;
    if (prevTimer !== null) clearTimeout(prevTimer);
    sidebarTimerRef.current = setTimeout(() => {
      setSidebarVisible(false);
    }, 350);
  }, []);

  const { data: avatarData } = useQuery({
    queryKey: ['me', 'avatarUrl'],
    queryFn: () => gqlClient.request<{ me: { avatarUrl: string | null } | null }>(AVATAR_QUERY),
  });
  const avatarUrl = avatarData?.me?.avatarUrl;

  const handleLogout = async () => {
    await gqlClient.request(LOGOUT_MUTATION);
    queryClient.clear();
    await navigate({ to: '/login' });
  };

  // The assistant's recent conversations render as subitems under its nav
  // entry (JEF-229), but only while the section is open — the same accordion
  // treatment Settings gets in the drawer.
  const renderMainNavItems = () =>
    MAIN_NAV.map((item, i) => (
      <div key={item.to}>
        <NavItem
          to={item.to}
          icon={<item.icon size={18} />}
          label={t(item.labelKey)}
          active={pathname.startsWith(item.to)}
          staggerIndex={i}
        />
        {item.to === '/assistant' && inAssistantSection && (
          <AssistantNavConversations activeId={search.conversation} onNavigate={closeSidebar} />
        )}
      </div>
    ));

  useHotkeys({ key: 'n', ctrl: true }, () => {
    navigate({ to: '/applications/new' });
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    closeSidebar();
  }, [pathname, closeSidebar]);

  // Cleanup sidebar timer on unmount
  useEffect(() => {
    return () => {
      const timer = sidebarTimerRef.current;
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  return (
    <ChatDockProvider>
      {/* The app shell is exactly one viewport tall at every breakpoint, so
          <main> below is the only thing that scrolls — h-dvh rather than
          min-h-screen, which grows with content (so the *body* scrolled
          too) and, on mobile, exceeds 100dvh whenever the browser toolbar
          is showing (100vh is the *largest* viewport). Pinning the shell to
          h-dvh lets a page say "fill the space" instead of computing its
          own total to subtract chrome from. */}
      <div className="flex h-dvh bg-gray-50 dark:bg-gray-900">
        <CommandPalette />
        <ShortcutCheatSheet isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        {/* Mobile sidebar drawer backdrop */}
        {sidebarVisible && (
          <div
            className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ease-out lg:hidden ${
              sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onClick={closeSidebar}
          />
        )}

        {/* Mobile sidebar drawer */}
        {sidebarVisible && (
          <aside
            className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col bg-white shadow-xl transition-transform duration-300 ease-out lg:hidden dark:bg-gray-800 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
              <span className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
                <LogoMark size={22} />
                Trakwyn
              </span>
              <button
                onClick={closeSidebar}
                aria-label={t('authenticatedLayout.closeMenu')}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                <XIcon size={18} />
              </button>
            </div>

            <nav
              aria-label={t('authenticatedLayout.mainNavigation')}
              className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
            >
              {renderMainNavItems()}

              <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  <AccountAvatarIcon avatarUrl={avatarUrl} size={18} />
                  {t('nav.settings')}
                </div>
                <div className="ml-2 space-y-0.5">
                  {SETTINGS_NAV.map((item, i) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`sidebar-nav-item flex items-center gap-2 rounded-lg py-1.5 pr-3 pl-5 text-sm transition-colors ${
                        pathname.startsWith(item.to)
                          ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
                      }`}
                      style={{ animationDelay: `${(MAIN_NAV.length + i) * 50}ms` }}
                    >
                      <item.icon size={14} />
                      {t(item.labelKey)}
                    </Link>
                  ))}
                </div>
              </div>
            </nav>

            <div className="mt-auto space-y-1 border-t border-gray-200 bg-white px-3 py-4 dark:border-gray-700 dark:bg-gray-800">
              <button
                onClick={handleLogout}
                data-testid="mobile-sidebar-logout"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
              >
                <LogOutIcon size={18} />
                {t('nav.signOut')}
              </button>
              <LegalFooterLinks className="mt-3 flex flex-col gap-1.5 border-t border-gray-100 px-3 pt-3 text-left text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400 [&>button]:text-left" />
            </div>
          </aside>
        )}

        {/* Mobile top header */}
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <button
              onClick={openSidebar}
              aria-label={t('authenticatedLayout.openMenu')}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              <MenuIcon size={18} />
            </button>
            <span className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
              <LogoMark size={22} />
              Trakwyn
            </span>
          </div>
          <NotificationInboxLink />
        </header>

        {/* Desktop sidebar */}
        <aside className="sidebar-desktop-entrance hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex lg:h-full dark:border-gray-700 dark:bg-gray-800">
          <div className="sidebar-entrance-item flex items-center justify-between border-b border-gray-200 px-6 py-5 dark:border-gray-700">
            <span className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
              <LogoMark size={22} />
              Trakwyn
            </span>
            <NotificationInboxButton />
          </div>

          <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {renderMainNavItems()}
          </nav>

          <div className="space-y-1 px-3 pb-2">
            <div
              className="sidebar-entrance-item"
              style={{ animationDelay: `${MAIN_NAV.length * 50}ms` }}
            >
              <NavItem
                to="/settings/profile"
                icon={<AccountAvatarIcon avatarUrl={avatarUrl} size={18} />}
                label={t('nav.settings')}
                active={pathname.startsWith('/settings')}
                staggerDelay={MAIN_NAV.length * 50}
              />
            </div>
          </div>

          <div className="mt-auto shrink-0 space-y-1 border-t border-gray-200 px-3 py-4 dark:border-gray-700">
            <button
              onClick={() => setShortcutsOpen(true)}
              className="sidebar-entrance-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
              style={{ animationDelay: `${(MAIN_NAV.length + 1) * 50}ms` }}
              title={t('shortcuts.showShortcuts')}
            >
              <KeyboardIcon size={18} />
              {t('nav.shortcuts')}
              <kbd className="ml-auto rounded-sm bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {getKeyModifier()}+/
              </kbd>
            </button>
            <div
              className="sidebar-entrance-item"
              style={{ animationDelay: `${(MAIN_NAV.length + 2) * 50}ms` }}
            >
              <button
                onClick={handleLogout}
                data-testid="desktop-sidebar-logout"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
              >
                <LogOutIcon size={18} />
                {t('nav.signOut')}
              </button>
            </div>
            <LegalFooterLinks className="mt-3 flex flex-col gap-1.5 border-t border-gray-100 px-3 pt-3 text-left text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400 [&>button]:text-left" />
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pt-0 lg:pb-12">
          {/* Opt-in, not the default. `h-full` is a *definite* height, which is
              what lets a page fill the viewport exactly — flex only distributes
              space a container actually has, so with an auto height this box
              grows to fit its content and the page's `flex-1` children are never
              asked to shrink. That's precisely what a chat pane or a kanban
              board needs and what an ordinary scrolling page must not get:
              giving a route a definite height changes where content sits
              mid-interaction, which can as easily be a drag-and-drop
              regression (the board's own `boardCollisionDetection`, JEF-242)
              as a squashed layout. So only routes that ask for it get it. */}
          <div
            key={sectionKey}
            className={`route-transition ${fillsViewport ? 'flex h-full flex-col' : ''}`}
          >
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav. Height = 4rem content + safe-area-inset-bottom.
          The main element's pb already matches this total so content doesn't
          overlap. */}
        <nav
          aria-label={t('authenticatedLayout.bottomNavigation')}
          className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-center border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-gray-700 dark:bg-gray-800"
        >
          <BottomNavItem
            to="/dashboard"
            icon={<LayoutDashboardIcon size={20} />}
            label={t('nav.dashboard')}
            active={pathname.startsWith('/dashboard')}
          />
          <BottomNavItem
            to="/applications"
            icon={<BriefcaseIcon size={20} />}
            label={t('nav.appsShort')}
            active={pathname.startsWith('/applications')}
          />
          <BottomNavItem
            to="/calendar"
            icon={<CalendarIcon size={20} />}
            label={t('nav.calendar')}
            active={pathname.startsWith('/calendar')}
          />
          <BottomNavItem
            to="/assistant"
            icon={<MessageCircleIcon size={20} />}
            label={t('nav.assistant')}
            active={pathname.startsWith('/assistant')}
          />
        </nav>

        <ChatDockFooter />
        <ChatDockFloatingWindow />
      </div>
    </ChatDockProvider>
  );
}

function AccountAvatarIcon({
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

function NavItem({
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

function BottomNavItem({
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
