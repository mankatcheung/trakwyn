import { Card, Skeleton } from '@trakwyn/ui';
import { SECTION_GROUPS } from '../lib/sections';
import { DETAIL_PAGE_WIDTH } from '../lib/pageWidth';

/**
 * The detail page's shape before its application has loaded: back link, header
 * card, section sider and one panel. Used by the page itself and by the
 * server-rendered app frame, so it has no text and needs no providers.
 */
export function ApplicationDetailSkeleton() {
  return (
    <div className={DETAIL_PAGE_WIDTH} aria-busy="true" data-testid="application-detail-skeleton">
      <Skeleton className="mb-4 h-6 w-40 rounded-sm" />
      <Card className="mb-6 p-4 sm:p-6">
        <Skeleton className="h-7 w-48 rounded-sm" />
        <Skeleton className="mt-2 h-5 w-64 max-w-full rounded-sm" />
        <Skeleton className="mt-3 h-6 w-24 rounded-full" />
      </Card>
      <div className="flex flex-col gap-6 md:flex-row">
        <div
          className="hidden h-fit w-52 shrink-0 flex-col gap-4 rounded-xl border border-stone-200 bg-white p-2 md:flex dark:border-stone-700 dark:bg-stone-800"
          data-testid="application-sider-pending"
        >
          {SECTION_GROUPS.map((group) => (
            <div key={group.titleKey} className="flex flex-col gap-0.5">
              <div className="px-2 pb-1">
                <Skeleton className="h-4 w-16 rounded-sm" />
              </div>
              {group.sections.map((section) => (
                <div
                  key={section.id}
                  data-row
                  className={`${section.wideOnly ? 'hidden lg:flex' : 'flex'} h-9 items-center gap-2.5 px-2.5 text-stone-400`}
                >
                  <section.icon size={16} />
                  <Skeleton className="h-3.5 w-24 rounded-sm" />
                </div>
              ))}
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
