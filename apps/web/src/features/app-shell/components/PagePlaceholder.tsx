import { Skeleton } from '@trakwyn/ui';
import { SETTINGS_SECTIONS } from '#/features/settings/lib/settingsSections';
import { ApplicationDetailSkeleton } from '#/features/application-detail/components/ApplicationDetailSkeleton';

const PROFILE_SECTION_ROWS = [0, 1, 2, 3, 4, 5, 6];
// Pages under /applications that are not one application.
const APPLICATION_LIST_PAGES = new Set(['new', 'board', 'trash']);

function isApplicationDetail(path: string): boolean {
  const [, section, id, rest] = path.split('/');
  return section === 'applications' && !!id && !rest && !APPLICATION_LIST_PAGES.has(id);
}

function SettingsPlaceholder() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <Skeleton className="mb-6 h-8 w-32 rounded-sm" />
      <div className="flex flex-col gap-8 lg:flex-row">
        <div
          className="hidden shrink-0 space-y-1 lg:block lg:w-48"
          data-testid="settings-sider-pending"
        >
          {SETTINGS_SECTIONS.map((item) => (
            <div key={item.to} data-row className="flex h-9 items-center gap-2 px-3 text-stone-400">
              <item.icon size={16} />
              <Skeleton className="h-3.5 w-24 rounded-sm" />
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function ProfilePlaceholder() {
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <Skeleton className="mb-2 h-8 w-40 rounded-sm" />
      <Skeleton className="mb-6 h-5 w-96 max-w-full rounded-sm sm:mb-8" />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[14rem_1fr] lg:items-start lg:gap-8">
        <div className="space-y-4" data-testid="profile-sider-pending">
          <Skeleton className="h-22 rounded-xl" />
          <div className="hidden space-y-0.5 lg:block">
            {PROFILE_SECTION_ROWS.map((row) => (
              <div key={row} className="flex h-9 items-center px-3">
                <Skeleton className="h-3.5 w-32 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}

function DefaultPlaceholder() {
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <Skeleton className="mb-6 h-8 w-48 rounded-sm sm:mb-8" />
      <Skeleton className="mb-8 h-24 rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

/** The content area of the app frame, with the page's own section sider if it has one. */
export function PagePlaceholder({ pathname }: { pathname: string }) {
  const path = pathname.replace(/\/$/, '');
  if (path === '/profile') return <ProfilePlaceholder />;
  if (path === '/settings' || path.startsWith('/settings/')) return <SettingsPlaceholder />;
  if (isApplicationDetail(path)) return <ApplicationDetailSkeleton />;
  return <DefaultPlaceholder />;
}
