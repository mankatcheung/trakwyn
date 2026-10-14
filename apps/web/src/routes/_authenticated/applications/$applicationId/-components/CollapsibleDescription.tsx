import { useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '#/lib/i18n';

/**
 * The job description for the header card below `lg` (JEF-403): three lines
 * when collapsed, with a toggle only when there is more than three lines to
 * show, so a short description gets no pointless control.
 */
export function CollapsibleDescription({ text }: { text: string }) {
  const { t } = useLocale();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Measured only while clamped: once expanded the element is as tall as its
  // text, so the check would answer "no" and hide the control that collapses it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [text, expanded]);

  return (
    <div>
      <p
        ref={ref}
        className={`whitespace-pre-wrap text-gray-700 dark:text-gray-300 ${expanded ? '' : 'line-clamp-3'}`}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 -ml-2 flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
        >
          {t(expanded ? 'applicationDetail.showLess' : 'applicationDetail.showMore')}
        </button>
      )}
    </div>
  );
}
