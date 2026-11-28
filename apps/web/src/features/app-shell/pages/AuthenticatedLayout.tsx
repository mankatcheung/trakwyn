import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Outlet, useChildMatches, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';
import { LOGOUT_MUTATION } from '#/features/auth/graphql/authQueries';
import { AVATAR_QUERY } from '#/features/app-shell/graphql/appShellQueries';
import { useHotkeys, getKeyModifier } from '#/hooks/useHotkeys';
import { LazyCommandPalette } from '#/features/app-shell/components/LazyCommandPalette';
import {
  LazyShortcutCheatSheet,
  preloadShortcutCheatSheet,
} from '#/features/app-shell/components/LazyShortcutCheatSheet';
import { LogoMark } from '#/components/LogoMark';
import { LegalFooterLinks } from '#/features/legal/components/LegalFooterLinks';
import { ChatDockProvider } from '#/features/chat/lib/chatDock';
import { ChatDockFooter } from '../../chat/components/dock/ChatDockFooter';
import { LazyChatDockFloatingWindow } from '../../chat/components/dock/LazyChatDockFloatingWindow';
import {
  NotificationInboxButton,
  NotificationInboxLink,
} from '../../notifications/components/NotificationInbox';
import { AssistantNavConversations } from '../../chat/components/AssistantNavConversations';
import { useLocale } from '#/lib/i18n';
import { consumeOAuthRegistration } from '#/lib/analytics';
import {
  BriefcaseIcon,
  CalendarIcon,
  KeyboardIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MessageCircleIcon,
  XIcon,
} from 'lucide-react';
import {
  AccountAvatarIcon,
  BottomNavItem,
  NavItem,
} from '#/features/app-shell/components/NavItems';
import { MAIN_NAV, SETTINGS_NAV } from '#/features/app-shell/lib/navItems';
import {
  BOTTOM_NAV_CLASS,
  BRAND_CLASS,
  MAIN_CLASS,
  MOBILE_HEADER_CLASS,
  SHELL_CLASS,
  SIDER_BRAND_ROW_CLASS,
  SIDER_CLASS,
  SIDER_FOOTER_CLASS,
} from '#/features/app-shell/lib/shellClasses';

export function AuthenticatedLayout() {
  const { t } = useLocale();
  const navigate = useNavigate();
  // The OAuth round trip from the register page lands here (JEF-514).
  useEffect(() => {
    consumeOAuthRegistration();
  }, []);
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
    queryFn: async () =>
      (await gqlClient.request(AVATAR_QUERY)) as { me: { avatarUrl: string | null } | null },
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
    MAIN_NAV.map((item) => (
      <div key={item.to}>
        <NavItem
          to={item.to}
          icon={<item.icon size={18} />}
          label={t(item.labelKey)}
          active={pathname.startsWith(item.to)}
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
      <div className={SHELL_CLASS}>
        <LazyCommandPalette />
        <LazyShortcutCheatSheet isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

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
            className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col bg-white shadow-xl transition-transform duration-300 ease-out lg:hidden dark:bg-stone-800 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-stone-200 p-4 dark:border-stone-700">
              <span className={BRAND_CLASS}>
                <LogoMark size={22} />
                Trakwyn
              </span>
              <button
                onClick={closeSidebar}
                aria-label={t('authenticatedLayout.closeMenu')}
                className="rounded-lg p-2 text-stone-500 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
              >
                <XIcon size={18} />
              </button>
            </div>

            <nav
              aria-label={t('authenticatedLayout.mainNavigation')}
              className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
            >
              {renderMainNavItems()}

              <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-700">
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-stone-500 dark:text-stone-400">
                  <AccountAvatarIcon avatarUrl={avatarUrl} size={18} />
                  {t('nav.settings')}
                </div>
                <div className="ml-2 space-y-0.5">
                  {SETTINGS_NAV.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-2 rounded-lg py-1.5 pr-3 pl-5 text-sm transition-colors ${
                        pathname.startsWith(item.to)
                          ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100'
                      }`}
                    >
                      <item.icon size={14} />
                      {t(item.labelKey)}
                    </Link>
                  ))}
                </div>
              </div>
            </nav>

            <div className="mt-auto space-y-1 border-t border-stone-200 bg-white px-3 py-4 dark:border-stone-700 dark:bg-stone-800">
              <button
                onClick={handleLogout}
                data-testid="mobile-sidebar-logout"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100"
              >
                <LogOutIcon size={18} />
                {t('nav.signOut')}
              </button>
              <LegalFooterLinks className="mt-3 flex flex-col gap-1.5 border-t border-stone-100 px-3 pt-3 text-left text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400 [&>button]:text-left" />
            </div>
          </aside>
        )}

        {/* Mobile top header */}
        <header className={MOBILE_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <button
              onClick={openSidebar}
              aria-label={t('authenticatedLayout.openMenu')}
              className="rounded-lg p-2 text-stone-500 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              <MenuIcon size={18} />
            </button>
            <span className={BRAND_CLASS}>
              <LogoMark size={22} />
              Trakwyn
            </span>
          </div>
          <NotificationInboxLink />
        </header>

        {/* Desktop sidebar */}
        <aside className={SIDER_CLASS}>
          <div className={SIDER_BRAND_ROW_CLASS}>
            <span className={BRAND_CLASS}>
              <LogoMark size={22} />
              Trakwyn
            </span>
            <NotificationInboxButton />
          </div>

          <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {renderMainNavItems()}
          </nav>

          <div className="space-y-1 px-3 pb-2">
            <div>
              <NavItem
                to="/settings/profile"
                icon={<AccountAvatarIcon avatarUrl={avatarUrl} size={18} />}
                label={t('nav.settings')}
                active={pathname.startsWith('/settings')}
              />
            </div>
          </div>

          <div className={SIDER_FOOTER_CLASS}>
            <button
              onClick={() => setShortcutsOpen(true)}
              onMouseEnter={preloadShortcutCheatSheet}
              onFocus={preloadShortcutCheatSheet}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100"
              title={t('shortcuts.showShortcuts')}
            >
              <KeyboardIcon size={18} />
              {t('nav.shortcuts')}
              <kbd className="ml-auto rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-600 dark:bg-stone-700 dark:text-stone-300">
                {getKeyModifier()}+/
              </kbd>
            </button>
            <div>
              <button
                onClick={handleLogout}
                data-testid="desktop-sidebar-logout"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100"
              >
                <LogOutIcon size={18} />
                {t('nav.signOut')}
              </button>
            </div>
            <LegalFooterLinks className="mt-3 flex flex-col gap-1.5 border-t border-stone-100 px-3 pt-3 text-left text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400 [&>button]:text-left" />
          </div>
        </aside>

        <main className={MAIN_CLASS}>
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
        <nav aria-label={t('authenticatedLayout.bottomNavigation')} className={BOTTOM_NAV_CLASS}>
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
        <LazyChatDockFloatingWindow />
      </div>
    </ChatDockProvider>
  );
}
