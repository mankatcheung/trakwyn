import { useEffect, useRef } from 'react';
import { useLocale } from '#/lib/i18n';
import { SectionGeneratedMarker } from './SectionGeneratedMarker';
import {
  SECTION_GROUPS,
  type SectionCounts,
  type SectionDef,
  type SectionId,
} from '../../lib/sections';

interface SectionNavProps {
  active: SectionId;
  counts?: SectionCounts;
  /** A section switch is in flight: the old section is still showing. */
  pending?: boolean;
  onOpen: (id: SectionId) => void;
}

/**
 * The desktop counterpart of `SectionIndex`: one information model, several
 * presentations (JEF-208). A vertical sidebar from `md`. It was a horizontal
 * tab bar from `lg` for a while (JEF-402), but ten tabs with icon, label and
 * count outgrew the page between 1024px and 1280px and the bar had to scroll
 * sideways, so the sidebar is back (JEF-411).
 */
export function SectionNav({ active, counts, pending = false, onOpen }: SectionNavProps) {
  const { t } = useLocale();
  const ref = useRef<HTMLElement>(null);

  // A deep link or a keyboard move can land on a tab that is scrolled out of view.
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const countFor = (section: SectionDef): number | null =>
    counts && section.countOf ? section.countOf(counts) : null;
  const generatedFor = (section: SectionDef): boolean | null =>
    counts && section.generatedOf ? section.generatedOf(counts) : null;

  return (
    <nav
      ref={ref}
      className="sticky top-20 hidden h-fit max-h-[calc(100vh-6rem)] w-52 shrink-0 flex-col gap-4 overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 md:flex dark:border-stone-700 dark:bg-stone-800"
      aria-label={t('applicationDetail.sectionNavAria')}
      aria-busy={pending}
    >
      {SECTION_GROUPS.map((group) => (
        <div key={group.titleKey} className="flex flex-col gap-0.5">
          <h2 className="px-2 pb-1 text-xs font-medium text-stone-400 dark:text-stone-500">
            {t(group.titleKey)}
          </h2>
          {group.sections.map((section) => {
            const count = countFor(section);
            const generated = generatedFor(section);
            const isActive = active === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onOpen(section.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`${section.wideOnly ? 'hidden lg:flex' : 'flex'} items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? `bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ${pending ? 'animate-pulse' : ''}`
                    : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-700/50 dark:hover:text-stone-200'
                }`}
              >
                <section.icon size={16} />
                <span className="flex-1 truncate">{t(section.labelKey)}</span>{' '}
                {generated !== null && <SectionGeneratedMarker generated={generated} />}
                {count !== null && count > 0 && (
                  <span className={`text-xs font-medium ${isActive ? '' : 'text-stone-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
