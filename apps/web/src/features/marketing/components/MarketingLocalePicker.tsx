import { useEffect, useId, useRef, useState } from 'react';
import { CheckIcon, GlobeIcon } from 'lucide-react';
import { LOCALE_OPTIONS, useLocale, type Locale } from '#/lib/i18n';

/**
 * Icon-only language switcher for the marketing pages — a single globe
 * button that opens a popup list of locales on click. Replaced the earlier
 * bordered `<select>` pill (JEF-228 follow-up), which was visually heavier
 * than the neighbouring theme toggle and the widest control in the header.
 *
 * The popup follows {@link StatusSelect}'s ARIA listbox pattern: a native
 * `<select>` would keep keyboard/screen-reader support for free, but an
 * icon trigger can't be one, so Up/Down/Home/End to move, Enter or Space to
 * choose, Escape to close, click-away to dismiss, and focus returned to the
 * trigger on close are built and tested here instead. Shares
 * `LOCALE_OPTIONS` with Settings rather than keeping a second list.
 *
 * @category Actions
 */
export function MarketingLocalePicker() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selectedIndex = Math.max(
    0,
    LOCALE_OPTIONS.findIndex((option) => option.value === locale),
  );

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Move focus onto the list once, when it opens, so the arrow keys reach it.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const openList = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const pick = (value: Locale) => {
    setLocale(value);
    close();
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
      event.preventDefault();
      openList();
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, LOCALE_OPTIONS.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(LOCALE_OPTIONS.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        pick(LOCALE_OPTIONS[activeIndex].value);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('settings.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        // Same visual treatment as MarketingThemeToggle's IconButton so the
        // two read as one icon group in the header.
        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      >
        <GlobeIcon size={18} />
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t('settings.language')}
          aria-activedescendant={`${listboxId}-${activeIndex}`}
          tabIndex={-1}
          ref={listRef}
          onKeyDown={onListKeyDown}
          // right-0: the picker sits at the header's outer edge in both the
          // desktop cluster and the mobile one, so the popup must grow left.
          className="absolute top-full right-0 z-50 mt-2 min-w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {LOCALE_OPTIONS.map((option, index) => {
            const selected = option.value === locale;
            const active = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => pick(option.value)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm whitespace-nowrap ${
                  active ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                <span className="flex-1">{option.label}</span>
                {selected && <CheckIcon size={14} aria-hidden="true" className="opacity-70" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
