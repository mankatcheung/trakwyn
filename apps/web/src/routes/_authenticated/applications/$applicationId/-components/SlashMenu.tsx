import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { useLocale } from '#/lib/i18n';
import type { SlashMenuController } from '#/lib/editor/slashMenuController';

/**
 * The popup for the `/` menu (JEF-575). Focus never leaves the editor, so the
 * list is announced the way a combobox is: the editor points at the listbox and
 * at the highlighted option, and a status line says how many blocks are offered.
 */
export function SlashMenu({
  editor,
  controller,
}: {
  editor: Editor;
  controller: SlashMenuController;
}) {
  const { t } = useLocale();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const open = state !== null && state.items.length > 0;
  const activeId = open && state ? `${listId}-${state.items[state.selectedIndex].id}` : undefined;
  const clientRect = state?.clientRect ?? null;

  // Sit under the slash, and follow it while the page scrolls or resizes.
  useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    const reference = { getBoundingClientRect: () => clientRect?.() ?? new DOMRect() };
    const place = () => {
      void computePosition(reference, list, {
        placement: 'bottom-start',
        strategy: 'fixed',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        list.style.left = `${x}px`;
        list.style.top = `${y}px`;
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, clientRect]);

  // The editor keeps focus, so it carries the combobox state for screen readers.
  useEffect(() => {
    const dom = editor.view.dom;
    if (!open || !activeId) return;
    dom.setAttribute('aria-haspopup', 'listbox');
    dom.setAttribute('aria-expanded', 'true');
    dom.setAttribute('aria-controls', listId);
    dom.setAttribute('aria-activedescendant', activeId);
    return () => {
      for (const name of [
        'aria-haspopup',
        'aria-expanded',
        'aria-controls',
        'aria-activedescendant',
      ]) {
        dom.removeAttribute(name);
      }
    };
  }, [editor, open, activeId, listId]);

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  return (
    <>
      <div role="status" className="sr-only">
        {open && state ? t('documents.editor.slash.available', { count: state.items.length }) : ''}
      </div>
      {open &&
        state &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={t('documents.editor.slash.menu')}
            className="fixed z-50 max-h-72 w-60 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
            // Clicking an entry must not move focus out of the editor.
            onMouseDown={(event) => event.preventDefault()}
          >
            {state.items.map((item, index) => {
              const selected = index === state.selectedIndex;
              return (
                <div
                  key={item.id}
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => controller.select(index)}
                  onClick={() => state.command(item)}
                  className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${
                    selected
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <item.Icon className="size-4 shrink-0" aria-hidden="true" />
                  {t(item.labelKey)}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
