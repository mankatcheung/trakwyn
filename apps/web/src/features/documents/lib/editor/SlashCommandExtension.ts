import { Extension } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import type { SlashMenuController } from './slashMenuController';
import type { SlashCommandItem } from './slashCommands';

export interface SlashCommandOptions {
  controller: SlashMenuController;
  /** The commands a query matches. Passed in so labels come from the reader's language. */
  filter: (query: string) => SlashCommandItem[];
}

const SLASH_COMMAND_KEY = new PluginKey('slashCommand');

/**
 * Typing `/` in an empty block opens the block menu (JEF-575). It is skipped
 * in lists and code, where a block change would not do what the entry says,
 * and whenever the editor is read-only.
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        editor: this.editor,
        pluginKey: SLASH_COMMAND_KEY,
        char: '/',
        startOfLine: true,
        allow: ({ editor, state, range }) => {
          if (!editor.isEditable) return false;
          if (editor.isActive('listItem') || editor.isActive('codeBlock')) return false;
          // Only the `/query` in the block: a slash at the front of a sentence is just a slash.
          const { parent } = state.doc.resolve(range.from);
          return parent.textContent === state.doc.textBetween(range.from, range.to);
        },
        items: ({ query }) => this.options.filter(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => this.options.controller.render(),
      }),
    ];
  },
});
