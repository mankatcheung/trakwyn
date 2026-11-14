import type { Editor } from '@tiptap/react';
import { ColumnsIcon, RowsIcon, Table2Icon, Trash2Icon, type LucideIcon } from 'lucide-react';

/** What "insert table" makes: a header row over two body rows, three columns wide. */
export const NEW_TABLE = { rows: 3, cols: 3, withHeaderRow: true } as const;

export type TableCommandId =
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'toggleHeaderRow'
  | 'deleteTable';

/**
 * The commands of the menu that appears with the cursor in a table (JEF-582):
 * add and remove rows and columns, make the first row a header, delete the table.
 * Merging and resizing cells are left out on purpose; the PDF prints equal columns.
 */
export const TABLE_COMMANDS: ReadonlyArray<{
  id: TableCommandId;
  labelKey: string;
  Icon: LucideIcon;
  danger?: boolean;
}> = [
  { id: 'addRowBefore', labelKey: 'documents.editor.table.addRowBefore', Icon: RowsIcon },
  { id: 'addRowAfter', labelKey: 'documents.editor.table.addRowAfter', Icon: RowsIcon },
  { id: 'deleteRow', labelKey: 'documents.editor.table.deleteRow', Icon: RowsIcon, danger: true },
  { id: 'addColumnBefore', labelKey: 'documents.editor.table.addColumnBefore', Icon: ColumnsIcon },
  { id: 'addColumnAfter', labelKey: 'documents.editor.table.addColumnAfter', Icon: ColumnsIcon },
  {
    id: 'deleteColumn',
    labelKey: 'documents.editor.table.deleteColumn',
    Icon: ColumnsIcon,
    danger: true,
  },
  { id: 'toggleHeaderRow', labelKey: 'documents.editor.table.headerRow', Icon: Table2Icon },
  {
    id: 'deleteTable',
    labelKey: 'documents.editor.table.deleteTable',
    Icon: Trash2Icon,
    danger: true,
  },
];

export function runTableCommand(editor: Editor, id: TableCommandId): boolean {
  const chain = editor.chain().focus();
  switch (id) {
    case 'addRowBefore':
      return chain.addRowBefore().run();
    case 'addRowAfter':
      return chain.addRowAfter().run();
    case 'deleteRow':
      return chain.deleteRow().run();
    case 'addColumnBefore':
      return chain.addColumnBefore().run();
    case 'addColumnAfter':
      return chain.addColumnAfter().run();
    case 'deleteColumn':
      return chain.deleteColumn().run();
    case 'toggleHeaderRow':
      return chain.toggleHeaderRow().run();
    case 'deleteTable':
      return chain.deleteTable().run();
  }
}

/** Whether a command can act at the cursor, so the menu disables what would do nothing. */
export function canRunTableCommand(editor: Editor, id: TableCommandId): boolean {
  const can = editor.can();
  switch (id) {
    case 'addRowBefore':
      return can.addRowBefore();
    case 'addRowAfter':
      return can.addRowAfter();
    case 'deleteRow':
      return can.deleteRow();
    case 'addColumnBefore':
      return can.addColumnBefore();
    case 'addColumnAfter':
      return can.addColumnAfter();
    case 'deleteColumn':
      return can.deleteColumn();
    case 'toggleHeaderRow':
      return can.toggleHeaderRow();
    case 'deleteTable':
      return can.deleteTable();
  }
}
