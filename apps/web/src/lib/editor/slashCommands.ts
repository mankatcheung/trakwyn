import type { Editor, Range } from '@tiptap/react';
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  type LucideIcon,
} from 'lucide-react';

/** One entry of the `/` menu. A later ticket (table, AI actions) adds one entry here. */
export interface SlashCommandItem {
  id: string;
  /** i18n key of the label; the menu shows it and the filter matches it. */
  labelKey: string;
  /** Extra English words that find the command ("h1", "ul", "hr"). */
  keywords: readonly string[];
  Icon: LucideIcon;
  /** Replaces the typed `/query` with the block. */
  run: (editor: Editor, range: Range) => void;
}

const heading = (level: 1 | 2 | 3) => (editor: Editor, range: Range) => {
  editor.chain().focus().deleteRange(range).setHeading({ level }).run();
};

export const SLASH_COMMANDS: readonly SlashCommandItem[] = [
  {
    id: 'heading1',
    labelKey: 'documents.editor.blockHeading1',
    keywords: ['h1', 'title', 'heading'],
    Icon: Heading1Icon,
    run: heading(1),
  },
  {
    id: 'heading2',
    labelKey: 'documents.editor.blockHeading2',
    keywords: ['h2', 'subtitle', 'heading'],
    Icon: Heading2Icon,
    run: heading(2),
  },
  {
    id: 'heading3',
    labelKey: 'documents.editor.blockHeading3',
    keywords: ['h3', 'heading'],
    Icon: Heading3Icon,
    run: heading(3),
  },
  {
    id: 'bulletList',
    labelKey: 'documents.editor.bulletList',
    keywords: ['ul', 'bullets', 'list', 'unordered'],
    Icon: ListIcon,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: 'orderedList',
    labelKey: 'documents.editor.orderedList',
    keywords: ['ol', 'numbers', 'list', 'ordered'],
    Icon: ListOrderedIcon,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: 'blockquote',
    labelKey: 'documents.editor.blockquote',
    keywords: ['quote', 'blockquote', 'citation'],
    Icon: QuoteIcon,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    id: 'rule',
    labelKey: 'documents.editor.rule',
    keywords: ['hr', 'divider', 'line', 'rule', 'separator'],
    Icon: MinusIcon,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

/**
 * The commands a typed query matches, in list order. A command matches when the
 * query appears in its shown label (in the reader's language), its id or one of
 * its keywords. An empty query matches everything.
 */
export function filterSlashCommands(
  commands: readonly SlashCommandItem[],
  query: string,
  labelOf: (item: SlashCommandItem) => string,
): SlashCommandItem[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...commands];
  return commands.filter(
    (item) =>
      labelOf(item).toLowerCase().includes(needle) ||
      item.id.toLowerCase().startsWith(needle) ||
      item.keywords.some((keyword) => keyword.startsWith(needle)),
  );
}
