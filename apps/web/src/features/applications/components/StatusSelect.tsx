import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { APPLICATION_STATUSES, statusColor } from '#/features/applications/lib/statusColors';

export interface StatusSelectProps {
  /** Selected status, or '' for the "any status" option. */
  value: string;
  onChange: (value: string) => void;
  /** Label for the empty option — "All statuses", "Change status…". */
  placeholder: string;
  /** Accessible name for the trigger. */
  label: string;
  disabled?: boolean;
  /**
   * `dark` matches the bulk action bar, which sits on its own dark surface in
   * both themes and so cannot use the theme-following palette.
   */
  variant?: 'default' | 'dark';
  /** Keeps the trigger showing `placeholder` after a pick, for action menus. */
  resetAfterSelect?: boolean;
  /**
   * Icon-only trigger under the sm breakpoint (JEF-232): renders `mobileIcon`
   * in place of the label text so four filter controls fit one phone row. The
   * aria-label and listbox behaviour are unchanged; a picked status stays
   * visible as its colour dot beside the icon.
   */
  iconOnlyOnMobile?: boolean;
  /** Shown instead of the label below sm when `iconOnlyOnMobile` is set. */
  mobileIcon?: ReactNode;
  className?: string;
}

/**
 * Status picker that shows each option's colour.
 *
 * A native `<select>` cannot do this: browsers render `<option>` with the
 * platform's own list widget and ignore most styling — Safari and macOS
 * Firefox drop `background`/`color` entirely — so a coloured swatch would
 * appear on some machines and silently vanish on others. This is the
 * ARIA listbox pattern instead, which means the keyboard and screen-reader
 * behaviour a native select gives for free has to be built and tested here:
 * Up/Down/Home/End to move, Enter or Space to choose, Escape to close,
 * click-away to dismiss, and focus returned to the trigger on close.
 *
 * The colour is decoration. Every option carries its localized label, and the
 * trigger shows the selected label as text.
 */
export function StatusSelect({
  value,
  onChange,
  placeholder,
  label,
  disabled = false,
  variant = 'default',
  resetAfterSelect = false,
  iconOnlyOnMobile = false,
  mobileIcon,
  className,
}: StatusSelectProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  // '' (the placeholder) is index 0; the statuses follow.
  const options = ['', ...APPLICATION_STATUSES];
  const selectedIndex = Math.max(0, options.indexOf(value));

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

  const pick = (option: string) => {
    onChange(option);
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
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
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
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        pick(options[activeIndex]);
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

  const labelFor = (status: string) => (status ? t(`status.${status}`) : placeholder);
  const triggerLabel = resetAfterSelect ? placeholder : labelFor(value);
  const isDark = variant === 'dark';

  const triggerClasses = [
    'flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed',
    isDark
      ? 'bg-gray-800 dark:bg-gray-600 border-gray-700 dark:border-gray-500 text-white'
      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const statusDot =
    value && !resetAfterSelect ? (
      <span className={`size-2 rounded-full ${statusColor(value).dot}`} aria-hidden="true" />
    ) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={triggerClasses}
      >
        {iconOnlyOnMobile ? (
          <>
            <span className="flex items-center gap-1.5 sm:hidden">
              {statusDot}
              {mobileIcon}
            </span>
            <span className="hidden items-center gap-2 sm:flex">
              {statusDot}
              <span className="capitalize">{triggerLabel}</span>
              <ChevronDownIcon size={14} aria-hidden="true" className="opacity-60" />
            </span>
          </>
        ) : (
          <>
            {statusDot}
            <span className="capitalize">{triggerLabel}</span>
            <ChevronDownIcon size={14} aria-hidden="true" className="opacity-60" />
          </>
        )}
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listboxId}-${activeIndex}`}
          tabIndex={-1}
          ref={listRef}
          onKeyDown={onListKeyDown}
          className={`absolute z-50 mt-1 max-h-72 min-w-full overflow-y-auto rounded-lg border py-1 shadow-lg focus:outline-none ${
            isDark
              ? 'border-gray-700 bg-gray-800 text-white dark:border-gray-600 dark:bg-gray-700'
              : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
          }`}
        >
          {options.map((option, index) => {
            const selected = option === value;
            const active = index === activeIndex;
            return (
              <li
                key={option || 'any'}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => pick(option)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm whitespace-nowrap ${
                  active
                    ? isDark
                      ? 'bg-gray-700 dark:bg-gray-600'
                      : 'bg-gray-100 dark:bg-gray-700'
                    : ''
                }`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    option
                      ? statusColor(option).dot
                      : 'border border-current bg-transparent opacity-40'
                  }`}
                  aria-hidden="true"
                />
                <span className="flex-1 capitalize">{labelFor(option)}</span>
                {selected && <CheckIcon size={14} aria-hidden="true" className="opacity-70" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
