import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { PluginKey } from '@tiptap/pm/state';
import { useLocale } from '#/lib/i18n';
import { TABLE_COMMANDS, canRunTableCommand, runTableCommand } from '#/lib/editor/tableCommands';

const TABLE_MENU_KEY = new PluginKey('documentTableMenu');

/**
 * The small menu that appears while the cursor is in a table (JEF-582): add or
 * remove a row or column, switch the first row to a header, delete the table. It
 * shows for a cursor, not a range of text, which is the formatting menu's
 * moment, so the two never stack. Focus stays in the editor: the buttons do not
 * take it on mouse down.
 */
export function DocumentEditorTableMenu({
  editor,
  editable,
}: {
  editor: Editor;
  editable: boolean;
}) {
  const { t } = useLocale();
  const enabled = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      Object.fromEntries(TABLE_COMMANDS.map(({ id }) => [id, canRunTableCommand(e, id)])),
  });

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={TABLE_MENU_KEY}
      shouldShow={({ editor: e, view, element, state }) =>
        editable &&
        state.selection.empty &&
        e.isActive('table') &&
        (view.hasFocus() || element.contains(document.activeElement))
      }
      updateDelay={100}
      options={{ placement: 'top', offset: 8, flip: true, shift: { padding: 8 } }}
      className="z-40 w-max max-w-[min(28rem,calc(100vw-1rem))] rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
    >
      <div
        role="toolbar"
        aria-label={t('documents.editor.table.menu')}
        className="flex flex-wrap items-center gap-0.5 p-1"
        onMouseDown={(event) => event.preventDefault()}
      >
        {TABLE_COMMANDS.map(({ id, labelKey, Icon, danger }) => (
          <button
            key={id}
            type="button"
            title={t(labelKey)}
            aria-label={t(labelKey)}
            disabled={!enabled[id]}
            onClick={() => runTableCommand(editor, id)}
            className={`flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              danger
                ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <Icon className="size-3.5" />
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </BubbleMenu>
  );
}
