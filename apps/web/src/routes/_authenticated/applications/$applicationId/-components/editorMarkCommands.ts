import type { Editor } from '@tiptap/react';
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  UnderlineIcon,
  type LucideIcon,
} from 'lucide-react';

export type MarkId = 'bold' | 'italic' | 'underline' | 'strike';

/**
 * The text marks the toolbar and the bubble menu both offer (JEF-573, JEF-574).
 * One list, so a label, shortcut or command can never differ between the two.
 */
export const MARK_COMMANDS: ReadonlyArray<{
  id: MarkId;
  labelKey: string;
  shortcut: string;
  Icon: LucideIcon;
}> = [
  { id: 'bold', labelKey: 'documents.editor.bold', shortcut: 'Mod-b', Icon: BoldIcon },
  { id: 'italic', labelKey: 'documents.editor.italic', shortcut: 'Mod-i', Icon: ItalicIcon },
  {
    id: 'underline',
    labelKey: 'documents.editor.underline',
    shortcut: 'Mod-u',
    Icon: UnderlineIcon,
  },
  {
    id: 'strike',
    labelKey: 'documents.editor.strike',
    shortcut: 'Mod-Shift-s',
    Icon: StrikethroughIcon,
  },
];

/** What a mark button needs to know about the current selection. */
export function readMarkState(editor: Editor) {
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    link: editor.isActive('link'),
    linkHref: (editor.getAttributes('link').href as string | undefined) ?? '',
  };
}

export function runMarkCommand(editor: Editor, id: MarkId): void {
  const chain = editor.chain().focus();
  if (id === 'bold') chain.toggleBold().run();
  else if (id === 'italic') chain.toggleItalic().run();
  else if (id === 'underline') chain.toggleUnderline().run();
  else chain.toggleStrike().run();
}
