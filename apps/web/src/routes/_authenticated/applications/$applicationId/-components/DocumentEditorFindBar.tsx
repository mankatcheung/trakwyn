import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  CaseSensitiveIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  WholeWordIcon,
  XIcon,
} from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import type { FindMode } from '#/lib/editor/findShortcuts';
import { ToolbarButton } from './EditorToolbarButton';

interface DocumentEditorFindBarProps {
  editor: Editor;
  /** Passed in, as for the toolbar: `setEditable(…, false)` emits no transaction. */
  editable: boolean;
  mode: FindMode;
  onModeChange: (mode: FindMode) => void;
  onClose: () => void;
  /** Changes each time the shortcut is pressed again, to put the cursor back in the find field. */
  focusSignal?: number;
}

const INPUT_CLASS =
  'min-w-0 flex-1 rounded-sm border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
const BUTTON_CLASS =
  'rounded-sm border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700';

/**
 * The find and replace bar above the document (JEF-580). The search itself is
 * Tiptap's FindAndReplace extension: it highlights matches, scrolls the
 * current one into view and replaces all of them in one transaction, so one
 * undo restores the document. This is only the controls.
 */
export function DocumentEditorFindBar({
  editor,
  editable,
  mode,
  onModeChange,
  onClose,
  focusSignal,
}: DocumentEditorFindBarProps) {
  const { t } = useLocale();
  const findRef = useRef<HTMLInputElement>(null);
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const { total, current, caseSensitive, wholeWord } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const s = e.storage.findAndReplace;
      return {
        total: s.results.length,
        current: s.currentIndex,
        caseSensitive: s.caseSensitive,
        wholeWord: s.wholeWord,
      };
    },
  });
  const off = !editable;

  useEffect(() => {
    findRef.current?.focus();
    findRef.current?.select();
  }, [focusSignal]);

  // Closing the bar, however it happens, takes the highlights with it.
  useEffect(
    () => () => {
      if (!editor.isDestroyed) editor.commands.clearSearch();
    },
    [editor],
  );

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  const step = (backwards: boolean) => {
    if (backwards) editor.commands.goToPreviousResult();
    else editor.commands.goToNextResult();
  };

  const onFindKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      step(event.shiftKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const onReplaceKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      editor.commands.replace();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const changeTerm = (value: string) => {
    setFindTerm(value);
    editor.commands.setSearchTerm(value);
  };

  const changeReplaceTerm = (value: string) => {
    setReplaceTerm(value);
    editor.commands.setReplaceTerm(value);
  };

  const replacing = mode === 'replace';
  const counter =
    findTerm === ''
      ? ''
      : total === 0
        ? t('documents.editor.findNoResults')
        : t('documents.editor.findCount', { current: (current ?? 0) + 1, total });

  return (
    <div
      role="search"
      aria-label={t('documents.editor.find')}
      className="space-y-2 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={findRef}
          type="text"
          value={findTerm}
          disabled={off}
          aria-label={t('documents.editor.find')}
          placeholder={t('documents.editor.find')}
          onChange={(e) => changeTerm(e.target.value)}
          onKeyDown={onFindKeyDown}
          className={INPUT_CLASS}
        />
        <span
          role="status"
          className="min-w-16 text-xs whitespace-nowrap text-gray-600 dark:text-gray-400"
        >
          {counter}
        </span>
        <ToolbarButton
          label={t('documents.editor.findMatchCase')}
          pressed={caseSensitive}
          disabled={off}
          onClick={() => editor.commands.setCaseSensitive(!caseSensitive)}
        >
          <CaseSensitiveIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.findWholeWord')}
          pressed={wholeWord}
          disabled={off}
          onClick={() => editor.commands.setWholeWord(!wholeWord)}
        >
          <WholeWordIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.findPrevious')}
          shortcut="Shift-Enter"
          disabled={off || total === 0}
          onClick={() => step(true)}
        >
          <ChevronUpIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.findNext')}
          shortcut="Enter"
          disabled={off || total === 0}
          onClick={() => step(false)}
        >
          <ChevronDownIcon className="size-4" />
        </ToolbarButton>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={off}
          onClick={() => onModeChange(replacing ? 'find' : 'replace')}
        >
          {replacing
            ? t('documents.editor.findHideReplace')
            : t('documents.editor.findShowReplace')}
        </button>
        <ToolbarButton label={t('documents.editor.findClose')} shortcut="Escape" onClick={close}>
          <XIcon className="size-4" />
        </ToolbarButton>
      </div>
      {replacing && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={replaceTerm}
            disabled={off}
            aria-label={t('documents.editor.findReplaceWith')}
            placeholder={t('documents.editor.findReplaceWith')}
            onChange={(e) => changeReplaceTerm(e.target.value)}
            onKeyDown={onReplaceKeyDown}
            className={INPUT_CLASS}
          />
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={off || total === 0}
            onClick={() => editor.commands.replace()}
          >
            {t('documents.editor.findReplace')}
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={off || total === 0}
            onClick={() => editor.commands.replaceAll()}
          >
            {t('documents.editor.findReplaceAll')}
          </button>
        </div>
      )}
    </div>
  );
}
