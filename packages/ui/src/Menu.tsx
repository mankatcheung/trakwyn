import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './Modal';
import { CheckIcon } from 'lucide-react';
import { useIsWideViewport, type WideViewportBreakpoint } from './useIsWideViewport';

export type MenuAlign = 'start' | 'end';

/**
 * Panel width in px, set explicitly rather than by a utility class: the
 * dropdown is portalled out of the app's own DOM, and its labels are short
 * and predictable, so a fixed width is both simpler and immune to a host
 * page's layout.
 */
const PANEL_WIDTH = 224;

/** Space between the trigger and the panel. */
const GAP = 4;

export interface MenuItem {
  /** Stable identity — also what `onSelect` receives. */
  id: string;
  label: string;
  /** Rendered before the label at 16px on desktop, 18px in the sheet. */
  icon?: ReactNode;
  /** Renders the row in the destructive tone, and last by convention. */
  destructive?: boolean;
  disabled?: boolean;
  /** Draws a divider above this item. */
  separated?: boolean;
  /**
   * Leaves the menu open after this item is chosen. For an item that swaps
   * the menu's own `items` — a second pane — rather than performing an action.
   */
  keepOpen?: boolean;
  /** Marks the item as the current choice: `aria-current` and a check. */
  current?: boolean;
}

export interface MenuProps {
  /** The button that opens the menu. Gets the aria wiring and the ref. */
  trigger: (props: {
    ref: (node: HTMLButtonElement | null) => void;
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
  }) => ReactNode;
  items: MenuItem[];
  onSelect: (id: string) => void;
  /** Which edge of the trigger the dropdown lines up with. Desktop only. */
  align?: MenuAlign;
  /** Names the menu for assistive tech, and titles the mobile sheet. */
  label: string;
  /** Width from which this is a dropdown rather than a sheet. Defaults to `sm`. */
  breakpoint?: WideViewportBreakpoint;
  /** Called whenever the menu closes, however it closed — for resetting a pane. */
  onClose?: () => void;
}

/**
 * A dropdown of actions on desktop, the same actions as a bottom sheet on
 * a phone (JEF-258).
 *
 * Built because a row of four text-link actions does not fit a phone: the app
 * had been hiding the labels below `sm` and leaving four unlabelled 14px
 * icons side by side. One trigger with labelled items reads at every width
 * and stops the row growing each time an action is added.
 *
 * The sheet is `Modal position="bottom"`, not a second implementation — it
 * already has the backdrop, focus trap, Escape handling and safe-area
 * padding, and reusing it means a phone gets 52px rows with real labels
 * instead of a dropdown it would have to aim at.
 *
 * Keyboard: Enter/Space/ArrowDown/ArrowUp open (the last from the end),
 * arrows move, Home/End jump, Enter/Space choose, Escape and Tab close.
 * Focus returns to the trigger on close, which is what makes the menu usable
 * without a pointer at all.
 *
 * @category Overlay
 */
export function Menu({
  trigger,
  items,
  onSelect,
  align = 'end',
  label,
  breakpoint,
  onClose,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Bumped when a keepOpen item swaps the items, so focus is placed again on
  // the new first item even when `activeIndex` is already 0.
  const [focusTick, setFocusTick] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isWide = useIsWideViewport(breakpoint);
  const menuId = useId();
  const [position, setPosition] = useState<CSSProperties | null>(null);

  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index !== -1);

  // Held in a ref so a consumer passing a fresh function each render does not
  // rebuild `close`, which the document listeners below depend on.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    onCloseRef.current?.();
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  // Pointer and focus leaving the dropdown both mean "done with it". Bound on
  // the document only while open, so a closed menu costs nothing.
  useEffect(() => {
    if (!open || !isWide) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      // No focus return: the pointer has already moved the user elsewhere.
      close(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, isWide, close]);

  /**
   * The dropdown is portalled to `document.body`, so it is positioned against
   * the trigger's viewport rect rather than by `absolute` inside the row.
   * That is what lets it escape an ancestor's `overflow-hidden` — the
   * settings card clips anything positioned within it, which cut the menu
   * off mid-item.
   *
   * Measured in a layout effect so the panel never paints at the wrong place
   * first, and re-measured on scroll and resize so it tracks the trigger.
   */
  useLayoutEffect(() => {
    if (!open || !isWide) return;

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(
        align === 'end'
          ? { top: rect.bottom + GAP, right: window.innerWidth - rect.right }
          : { top: rect.bottom + GAP, left: rect.left },
      );
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, isWide, align]);

  useEffect(() => {
    if (open && isWide) itemRefs.current[activeIndex]?.focus();
  }, [open, isWide, activeIndex, focusTick]);

  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    if (item.keepOpen) {
      setActiveIndex(0);
      setFocusTick((tick) => tick + 1);
    } else {
      close();
    }
    onSelect(item.id);
  };

  const step = (from: number, direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return from;
    const position = enabledIndexes.indexOf(from);
    const next = (position + direction + enabledIndexes.length) % enabledIndexes.length;
    return enabledIndexes[next] as number;
  };

  function onTriggerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (open) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(enabledIndexes[0] ?? 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(enabledIndexes[enabledIndexes.length - 1] ?? 0);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'Escape':
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        // Tab means "on to the next thing", not "choose" — let focus move.
        close(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((current) => step(current, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((current) => step(current, -1));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(enabledIndexes[0] ?? 0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? 0);
        break;
      default:
        break;
    }
  }

  const triggerNode = trigger({
    ref: (node) => {
      triggerRef.current = node;
    },
    onClick: () => (open ? close() : openAt(enabledIndexes[0] ?? 0)),
    'aria-haspopup': 'menu',
    'aria-expanded': open,
  });

  const itemClasses = (item: MenuItem, sheet: boolean) =>
    [
      'flex w-full items-center gap-3 text-left transition-colors',
      sheet ? 'min-h-[52px] px-4 text-base' : 'rounded-md px-2.5 py-2 text-sm whitespace-nowrap',
      item.disabled
        ? 'cursor-not-allowed opacity-50'
        : 'hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none',
      item.destructive ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200',
    ].join(' ');

  const renderItems = (sheet: boolean) =>
    items.map((item, index) => (
      <div key={item.id} className="contents">
        {item.separated && (
          <div className="my-1 h-px bg-gray-100 dark:bg-gray-700" role="separator" />
        )}
        <button
          type="button"
          role="menuitem"
          ref={(node) => {
            if (!sheet) itemRefs.current[index] = node;
          }}
          tabIndex={sheet || index === activeIndex ? 0 : -1}
          disabled={item.disabled}
          aria-current={item.current ? 'true' : undefined}
          onClick={() => choose(item)}
          className={itemClasses(item, sheet)}
        >
          {item.icon}
          {item.label}
          {item.current && (
            <CheckIcon
              size={sheet ? 18 : 16}
              className="ml-auto text-blue-600"
              aria-hidden="true"
            />
          )}
        </button>
      </div>
    ));

  return (
    <div className="relative inline-flex" onKeyDown={onTriggerKeyDown}>
      {triggerNode}

      {open &&
        isWide &&
        createPortal(
          <div
            ref={dropdownRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            // Position, width and stacking are inline rather than utility
            // classes: they are what makes the panel land in the right place
            // and clear its surroundings, and a consumer's CSS build must not
            // be able to drop them (it dropped `min-w-56`, which is how the
            // panel shipped with no width at all).
            style={{ position: 'fixed', zIndex: 50, width: PANEL_WIDTH, ...position }}
            className="rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {renderItems(false)}
          </div>,
          document.body,
        )}

      {open && !isWide && (
        <Modal open onClose={() => close()} position="bottom" ariaLabel={label}>
          <div role="menu" aria-label={label} className="py-2">
            {renderItems(true)}
          </div>
        </Modal>
      )}
    </div>
  );
}
