import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from 'lucide-react';
import { IconButton } from './IconButton';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Below this, a released drag springs back open instead of dismissing.
const SWIPE_CLOSE_DISTANCE_PX = 100;
// A fast flick dismisses even if it didn't cross the distance threshold.
const SWIPE_CLOSE_VELOCITY_PX_PER_MS = 0.5;
const SHEET_TRANSITION_MS = 200;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type ModalSize = 'sm' | 'md' | 'lg';
/**
 * Where the panel sits. `bottom` is the mobile sheet: same dialog, same focus
 * trap and Escape handling, different geometry — full width, anchored to the
 * bottom edge, rounded on top only. It additionally supports dragging the
 * panel down to dismiss it.
 */
export type ModalPosition = 'center' | 'bottom';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /**
   * Accessible name for a dialog with no visible title — a bottom sheet whose
   * header is a grab handle, say. Ignored when `title` is a string, which
   * already names the dialog.
   */
  ariaLabel?: string;
  size?: ModalSize;
  position?: ModalPosition;
  children: ReactNode;
}

/**
 * Centered overlay dialog with a backdrop, Escape-to-close, and focus
 * trapping. Renders via a portal to `document.body`.
 *
 * @category Overlay
 */
export function Modal({
  open,
  onClose,
  title,
  ariaLabel,
  size = 'md',
  position = 'center',
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ startY: number; startTime: number; dragging: boolean } | null>(null);
  const closeTimeoutRef = useRef<number | undefined>(undefined);

  // Undefined until the slide-in transition should start; 0 once at rest.
  const [dragOffsetPx, setDragOffsetPx] = useState<number | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable ?? panel)?.focus();

    let raf = 0;
    if (position === 'bottom') {
      setClosing(false);
      setIsDragging(false);
      dragRef.current = null;
      if (prefersReducedMotion()) {
        setDragOffsetPx(0);
      } else {
        setDragOffsetPx(undefined);
        raf = requestAnimationFrame(() => setDragOffsetPx(0));
      }
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      previouslyFocused.current?.focus();
    };
  }, [open, position]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // A touch-scroll starting on the backdrop has no scrollable target of its
  // own, so mobile browsers hand it to the page underneath instead — the
  // background scrolls while the modal sits on top of it. Locking body
  // scroll for the lifetime of the modal stops that.
  useEffect(() => {
    if (!open) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusableElements.length === 0) return;

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (closing) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
    if (contentRef.current && contentRef.current.scrollTop > 0) return;

    dragRef.current = { startY: event.clientY, startTime: performance.now(), dragging: true };
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current?.dragging) return;
    setDragOffsetPx(Math.max(0, event.clientY - dragRef.current.startY));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current?.dragging) return;

    const distance = Math.max(0, event.clientY - dragRef.current.startY);
    const elapsedMs = Math.max(1, performance.now() - dragRef.current.startTime);
    const velocity = distance / elapsedMs;
    dragRef.current = null;
    setIsDragging(false);

    const shouldDismiss =
      distance > SWIPE_CLOSE_DISTANCE_PX || velocity > SWIPE_CLOSE_VELOCITY_PX_PER_MS;

    if (!shouldDismiss) {
      setDragOffsetPx(0);
      return;
    }

    setClosing(true);
    setDragOffsetPx(panelRef.current?.offsetHeight ?? distance);
    closeTimeoutRef.current = window.setTimeout(
      onClose,
      prefersReducedMotion() ? 0 : SHEET_TRANSITION_MS,
    );
  }

  function handlePointerCancel() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    setDragOffsetPx(0);
  }

  const isSheet = position === 'bottom';
  const sheetTransform =
    isSheet && dragOffsetPx !== undefined ? `translateY(${dragOffsetPx}px)` : undefined;
  const sheetTransition = isSheet && !isDragging && !prefersReducedMotion();

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center ${
        position === 'bottom' ? 'items-end p-0' : 'items-center p-4'
      }`}
    >
      <div className="fixed inset-0 bg-black/50 touch-none" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : ariaLabel}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onPointerDown={isSheet ? handlePointerDown : undefined}
        onPointerMove={isSheet ? handlePointerMove : undefined}
        onPointerUp={isSheet ? endDrag : undefined}
        onPointerCancel={isSheet ? handlePointerCancel : undefined}
        style={
          isSheet
            ? { transform: sheetTransform, touchAction: isDragging ? 'none' : undefined }
            : undefined
        }
        className={`relative bg-white dark:bg-stone-800 shadow-lg w-full max-h-[85vh] flex flex-col overflow-hidden border border-stone-200 dark:border-stone-700 ${
          position === 'bottom'
            ? `rounded-t-2xl border-b-0 pb-[env(safe-area-inset-bottom)] ${
                sheetTransition ? 'transition-transform duration-200 ease-out' : ''
              }`
            : `rounded-xl ${SIZE_CLASSES[size]}`
        }`}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-700 shrink-0">
            <h2 className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
              {title}
            </h2>
            <IconButton label="Close" icon={<XIcon size={16} />} size="sm" onClick={onClose} />
          </div>
        )}
        <div ref={contentRef} className="flex-1 min-h-0 overflow-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
