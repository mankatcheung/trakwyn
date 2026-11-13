import { useState, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  MinusIcon,
  Undo2Icon,
  Redo2Icon,
} from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { normalizeLinkInput } from '#/lib/editorLinks';

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3';

const BLOCK_TYPES: ReadonlyArray<{ value: BlockType; labelKey: string }> = [
  { value: 'paragraph', labelKey: 'documents.editor.blockParagraph' },
  { value: 'h1', labelKey: 'documents.editor.blockHeading1' },
  { value: 'h2', labelKey: 'documents.editor.blockHeading2' },
  { value: 'h3', labelKey: 'documents.editor.blockHeading3' },
];

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);

/** `Mod-b` style shortcut as the reader's keyboard names it. */
function shortcutLabel(keys: string): string {
  const mac = isMac();
  return keys
    .split('-')
    .map((key) => {
      if (key === 'Mod') return mac ? '⌘' : 'Ctrl';
      if (key === 'Shift') return mac ? '⇧' : 'Shift';
      return key.toUpperCase();
    })
    .join(mac ? '' : '+');
}

interface ToolbarButtonProps {
  label: string;
  shortcut?: string;
  onClick: () => void;
  /** Set for toggles, so assistive tech reads the state. Omit for plain actions. */
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function ToolbarButton({
  label,
  shortcut,
  onClick,
  pressed,
  disabled,
  children,
}: ToolbarButtonProps) {
  const hint = shortcut ? `${label} (${shortcutLabel(shortcut)})` : label;
  return (
    <button
      type="button"
      title={hint}
      aria-label={label}
      aria-keyshortcuts={shortcut?.replace('Mod', 'Control')}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-sm p-1.5 transition-colors ${
        pressed
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
}

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
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    link: editor.isActive('link'),
    linkHref: (editor.getAttributes('link').href as string | undefined) ?? '',
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
}

function LinkForm({
  editor,
  initial,
  hasLink,
  onClose,
}: {
  editor: Editor;
  initial: string;
  hasLink: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);

  const apply = () => {
    const href = normalizeLinkInput(value);
    if (!href) {
      setInvalid(true);
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onClose();
  };

  return (
    <form
      role="group"
      aria-label={t('documents.editor.link')}
      className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 px-1.5 py-1.5 dark:border-gray-700"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
          editor.commands.focus();
        }
      }}
    >
      <input
        autoFocus
        type="text"
        inputMode="url"
        value={value}
        aria-label={t('documents.editor.linkUrl')}
        aria-invalid={invalid}
        aria-describedby={invalid ? 'editor-link-error' : undefined}
        placeholder="https://"
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
        className="min-w-0 flex-1 rounded-sm border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <button
        type="submit"
        className="cursor-pointer rounded-sm bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700"
      >
        {t('documents.editor.linkApply')}
      </button>
      {hasLink && (
        <button
          type="button"
          onClick={remove}
          className="cursor-pointer rounded-sm px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {t('documents.editor.linkRemove')}
        </button>
      )}
      {invalid && (
        <p id="editor-link-error" role="alert" className="w-full text-xs text-red-600">
          {t('documents.editor.linkInvalid')}
        </p>
      )}
    </form>
  );
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
        <ToolbarButton
          label={t('documents.editor.bold')}
          shortcut="Mod-b"
          pressed={state.bold}
          disabled={off}
          onClick={() => run((c) => c.toggleBold())}
        >
          <BoldIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.italic')}
          shortcut="Mod-i"
          pressed={state.italic}
          disabled={off}
          onClick={() => run((c) => c.toggleItalic())}
        >
          <ItalicIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.underline')}
          shortcut="Mod-u"
          pressed={state.underline}
          disabled={off}
          onClick={() => run((c) => c.toggleUnderline())}
        >
          <UnderlineIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.strike')}
          shortcut="Mod-Shift-s"
          pressed={state.strike}
          disabled={off}
          onClick={() => run((c) => c.toggleStrike())}
        >
          <StrikethroughIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t('documents.editor.link')}
          pressed={state.link || linkOpen}
          disabled={off}
          onClick={() => setLinkOpen((open) => !open)}
        >
          <LinkIcon className="size-4" />
        </ToolbarButton>
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
      </div>
      {linkOpen && !off && (
        <LinkForm
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
