import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale } from '#/lib/i18n';

// Sub-pixel layout can leave a fraction of a pixel to scroll at the far end.
const EDGE_TOLERANCE_PX = 2;

const FADE_BASE =
  'pointer-events-none absolute inset-y-0 z-10 w-10 from-stone-50 to-transparent dark:from-stone-900';

/**
 * The horizontally scrolling row of board columns, with a fade on each edge
 * that still has columns beyond it, so a cut-off last column reads as
 * "more this way" (JEF-686). The row is focusable so the arrow keys scroll it.
 */
export function BoardScroller({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > EDGE_TOLERANCE_PX;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_TOLERANCE_PX;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onScroll={measure}
        tabIndex={0}
        role="region"
        aria-label={t('applications.boardColumns')}
        data-testid="board-scroller"
        className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4 focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        {children}
      </div>
      {edges.start && (
        <div
          aria-hidden="true"
          data-testid="board-fade-start"
          className={`${FADE_BASE} left-0 bg-linear-to-r`}
        />
      )}
      {edges.end && (
        <div
          aria-hidden="true"
          data-testid="board-fade-end"
          className={`${FADE_BASE} right-0 bg-linear-to-l`}
        />
      )}
    </div>
  );
}
