import { useLocale } from '#/lib/i18n';
import { SectionGeneratedMarker } from './SectionGeneratedMarker';
import { SECTION_GROUPS, type SectionCounts, type SectionDef, type SectionId } from '../-sections';

interface SectionSidebarProps {
  active: SectionId;
  counts?: SectionCounts;
  onOpen: (id: SectionId) => void;
}

/**
 * The desktop counterpart of `SectionIndex`. The sidebar already worked, so it
 * keeps its shape and gains the same grouping and counts — one information
 * model, two presentations (JEF-208).
 */
export function SectionSidebar({ active, counts, onOpen }: SectionSidebarProps) {
  const { t } = useLocale();

  const countFor = (section: SectionDef): number | null =>
    counts && section.countOf ? section.countOf(counts) : null;
  const generatedFor = (section: SectionDef): boolean | null =>
    counts && section.generatedOf ? section.generatedOf(counts) : null;

  return (
    <nav
      className="sticky top-20 hidden h-fit w-52 shrink-0 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-2 md:flex dark:border-gray-700 dark:bg-gray-800"
      aria-label={t('applicationDetail.sectionNavAria')}
    >
      {SECTION_GROUPS.map((group) => (
        <div key={group.titleKey} className="flex flex-col gap-0.5">
          <h2 className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-gray-400 uppercase dark:text-gray-500">
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
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200'
                }`}
              >
                <section.icon size={16} />
                <span className="flex-1 truncate">{t(section.labelKey)}</span>{' '}
                {generated !== null && <SectionGeneratedMarker generated={generated} />}
                {count !== null && count > 0 && (
                  <span className={`text-[11px] font-bold ${isActive ? '' : 'text-gray-400'}`}>
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
