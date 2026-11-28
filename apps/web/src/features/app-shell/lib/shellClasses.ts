/**
 * The boxes of the signed-in frame, shared by `AuthenticatedLayout` and its
 * server-rendered placeholder `AppShellPending`, so swapping one for the other
 * moves nothing.
 */
export const SHELL_CLASS = 'flex h-dvh bg-stone-50 dark:bg-stone-900';

export const MOBILE_HEADER_CLASS =
  'fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-stone-200 bg-white px-4 lg:hidden dark:border-stone-700 dark:bg-stone-800';

export const SIDER_CLASS =
  'hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex lg:h-full dark:border-stone-700 dark:bg-stone-800';

export const SIDER_BRAND_ROW_CLASS =
  'flex items-center justify-between border-b border-stone-200 px-6 py-5 dark:border-stone-700';

export const SIDER_FOOTER_CLASS =
  'mt-auto shrink-0 space-y-1 border-t border-stone-200 px-3 py-4 dark:border-stone-700';

export const BRAND_CLASS =
  'flex items-center gap-2 text-lg font-medium text-stone-900 dark:text-stone-100';

export const MAIN_CLASS =
  'min-w-0 flex-1 overflow-auto pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pt-0 lg:pb-12';

export const BOTTOM_NAV_CLASS =
  'fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-center border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-stone-700 dark:bg-stone-800';
