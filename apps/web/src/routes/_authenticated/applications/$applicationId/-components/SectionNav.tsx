import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocale } from '#/lib/i18n';
import { SectionGeneratedMarker } from './SectionGeneratedMarker';
import { SECTION_GROUPS, type SectionCounts, type SectionDef, type SectionId } from '../-sections';

interface SectionNavProps {
  active: SectionId;
  counts?: SectionCounts;
  onOpen: (id: SectionId) => void;
}

const FADE_PX = 32;

/**
 * Which edges of a horizontally scrolling element have more content past them,
 * so the tab bar can fade exactly those edges and nothing when it all fits.
 */
function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, []);

  return { ref, edges };
}

const fadeStyle = ({ start, end }: { start: boolean; end: boolean }): CSSProperties | undefined => {
  if (!start && !end) return undefined;
  const gradient = `linear-gradient(to right, ${start ? 'transparent' : 'black'}, black ${FADE_PX}px, black calc(100% - ${FADE_PX}px), ${end ? 'transparent' : 'black'})`;
  return { maskImage: gradient, WebkitMaskImage: gradient };
};

/**
 * The desktop counterpart of `SectionIndex`: one information model, several
 * presentations (JEF-208). A vertical sidebar from `md`, and from `lg` a
 * horizontal tab bar above the content (JEF-402) — the same element restyled
 * rather than two components, so the buttons exist once in the DOM.
 */
export function SectionNav({ active, counts, onOpen }: SectionNavProps) {
  const { t } = useLocale();
  const { ref, edges } = useScrollEdges<HTMLElement>();

  // A deep link or a keyboard move can land on a tab that is scrolled out of view.
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active, ref]);

  const countFor = (section: SectionDef): number | null =>
    counts && section.countOf ? section.countOf(counts) : null;
  const generatedFor = (section: SectionDef): boolean | null =>
    counts && section.generatedOf ? section.generatedOf(counts) : null;

  return (
    <nav
      ref={ref}
      style={fadeStyle(edges)}
      className="sticky top-20 hidden h-fit w-52 shrink-0 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-2 md:flex lg:static lg:w-full lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-x-auto lg:p-1 dark:border-gray-700 dark:bg-gray-800"
      aria-label={t('applicationDetail.sectionNavAria')}
    >
      {SECTION_GROUPS.map((group) => (
        <div
          key={group.titleKey}
          className="flex flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-0.5 lg:border-l lg:border-gray-200 lg:px-0.5 lg:first:border-l-0 lg:first:pl-0 dark:lg:border-gray-700"
        >
          <h2 className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-gray-400 uppercase lg:sr-only dark:text-gray-500">
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
                className={`${section.wideOnly ? 'hidden lg:flex' : 'flex'} items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors lg:shrink-0 lg:gap-2 lg:px-2 lg:whitespace-nowrap ${
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
