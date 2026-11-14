import { useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  MinusIcon,
  TableIcon,
  Undo2Icon,
  Redo2Icon,
} from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { ToolbarButton } from './EditorToolbarButton';
import { DocumentEditorLinkForm } from './DocumentEditorLinkForm';
import { MARK_COMMANDS, readMarkState, runMarkCommand } from './editorMarkCommands';

import { NEW_TABLE } from '#/lib/editor/tableCommands';

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3';

const BLOCK_TYPES: ReadonlyArray<{ value: BlockType; labelKey: string }> = [
  { value: 'paragraph', labelKey: 'documents.editor.blockParagraph' },
  { value: 'h1', labelKey: 'documents.editor.blockHeading1' },
  { value: 'h2', labelKey: 'documents.editor.blockHeading2' },
  { value: 'h3', labelKey: 'documents.editor.blockHeading3' },
];

type Alignment = 'left' | 'center' | 'right';

/** The extension binds these keys itself; they are listed here for the tooltips. */
const ALIGNMENTS = [
  {
    value: 'left',
    labelKey: 'documents.editor.alignLeft',
    shortcut: 'Mod-Shift-l',
    Icon: AlignLeftIcon,
  },
  {
    value: 'center',
    labelKey: 'documents.editor.alignCenter',
    shortcut: 'Mod-Shift-e',
    Icon: AlignCenterIcon,
  },
  {
    value: 'right',
    labelKey: 'documents.editor.alignRight',
    shortcut: 'Mod-Shift-r',
    Icon: AlignRightIcon,
  },
] as const;

function Divider() {
  return <div role="separator" className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />;
}

function readState(editor: Editor) {
  const blockType: BlockType = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'paragraph';
  return {
    blockType,
    ...readMarkState(editor),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    table: editor.isActive('table'),
    // A table cannot go inside a table, or where a table is not allowed.
    canInsertTable: !editor.isActive('table') && editor.can().insertTable(NEW_TABLE),
    // A block nobody aligned reads as left.
    alignment: (editor.isActive({ textAlign: 'center' })
      ? 'center'
      : editor.isActive({ textAlign: 'right' })
        ? 'right'
        : 'left') as Alignment,
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
}

/**
 * The formatting toolbar above the document editor (JEF-573). It follows the
 * editor through `useEditorState`, so a keystroke re-renders only this
 * component, and it is disabled whenever the editor is read-only — the AI
 * helper locks the editor while a request is in flight.
 */
export function DocumentEditorToolbar({
  editor,
  editable,
}: {
  editor: Editor;
  /**
   * Passed in rather than read from the editor: `setEditable(…, false)` emits
   * no transaction, so a subscription to editor state never hears about it.
   */
  editable: boolean;
}) {
  const { t } = useLocale();
  const [linkOpen, setLinkOpen] = useState(false);
  const state = useEditorState({ editor, selector: ({ editor: e }) => readState(e) });
  const off = !editable;
  const run = (chain: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
    chain(editor.chain().focus()).run();

  const setBlockType = (value: BlockType) => {
    if (value === 'paragraph') run((c) => c.setParagraph());
    else run((c) => c.setHeading({ level: Number(value[1]) as 1 | 2 | 3 }));
  };

  const setAlignment = (value: Alignment) =>
    run((c) => (value === 'left' ? c.unsetTextAlign() : c.setTextAlign(value)));

  return (
    <div className="sticky top-0 z-30 rounded-t-lg border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
      <div
        role="toolbar"
        aria-label={t('documents.editor.toolbar')}
        aria-disabled={off}
        className="flex flex-wrap items-center gap-0.5 p-1.5"
      >
        <ToolbarButton
          label={t('documents.editor.undo')}
          shortcut="Mod-z"
          disabled={off || !state.canUndo}
          onClick={() => run((c) => c.undo())}
        >
          <Undo2Icon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.redo')}
          shortcut="Mod-Shift-z"
          disabled={off || !state.canRedo}
          onClick={() => run((c) => c.redo())}
        >
          <Redo2Icon className="size-4" />
        </ToolbarButton>
        <Divider />
        <select
          aria-label={t('documents.editor.blockType')}
          title={t('documents.editor.blockType')}
          value={state.blockType}
          disabled={off}
          onChange={(event) => setBlockType(event.target.value as BlockType)}
          className="rounded-sm border border-gray-200 bg-white px-1.5 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
        >
          {BLOCK_TYPES.map(({ value, labelKey }) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
        <Divider />
        {MARK_COMMANDS.map(({ id, labelKey, shortcut, Icon }) => (
          <ToolbarButton
            key={id}
            label={t(labelKey)}
            shortcut={shortcut}
            pressed={state[id]}
            disabled={off}
            onClick={() => runMarkCommand(editor, id)}
          >
            <Icon className="size-4" />
          </ToolbarButton>
        ))}
        <ToolbarButton
          label={t('documents.editor.link')}
          pressed={state.link || linkOpen}
          disabled={off}
          onClick={() => setLinkOpen((open) => !open)}
        >
          <LinkIcon className="size-4" />
        </ToolbarButton>
        <Divider />
        {ALIGNMENTS.map(({ value, labelKey, shortcut, Icon }) => (
          <ToolbarButton
            key={value}
            label={t(labelKey)}
            shortcut={shortcut}
            pressed={state.alignment === value}
            disabled={off}
            onClick={() => setAlignment(value)}
          >
            <Icon className="size-4" />
          </ToolbarButton>
        ))}
        <Divider />
        <ToolbarButton
          label={t('documents.editor.bulletList')}
          shortcut="Mod-Shift-8"
          pressed={state.bulletList}
          disabled={off}
          onClick={() => run((c) => c.toggleBulletList())}
        >
          <ListIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.orderedList')}
          shortcut="Mod-Shift-7"
          pressed={state.orderedList}
          disabled={off}
          onClick={() => run((c) => c.toggleOrderedList())}
        >
          <ListOrderedIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.blockquote')}
          shortcut="Mod-Shift-b"
          pressed={state.blockquote}
          disabled={off}
          onClick={() => run((c) => c.toggleBlockquote())}
        >
          <QuoteIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.rule')}
          disabled={off}
          onClick={() => run((c) => c.setHorizontalRule())}
        >
          <MinusIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.insertTable')}
          pressed={state.table}
          disabled={off || !state.canInsertTable}
          onClick={() => run((c) => c.insertTable(NEW_TABLE))}
        >
          <TableIcon className="size-4" />
        </ToolbarButton>
      </div>
      {linkOpen && !off && (
        <DocumentEditorLinkForm
          key={state.linkHref}
          editor={editor}
          initial={state.linkHref}
          hasLink={state.link}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </div>
  );
}
