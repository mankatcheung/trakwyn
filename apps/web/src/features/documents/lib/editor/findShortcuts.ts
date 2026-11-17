import { Extension } from '@tiptap/core';

export type FindMode = 'find' | 'replace';

export interface FindShortcutsOptions {
  /** Asked to open the find bar, in find or in find-and-replace mode. */
  onOpen: (mode: FindMode) => void;
}

/**
 * Cmd/Ctrl+F and Cmd/Ctrl+H (and Shift+H), for the find bar (JEF-580). Tiptap runs keyboard
 * shortcuts only while the editor has focus, so the browser's own find still
 * opens everywhere else on the page. A read-only editor (the AI helper has it
 * locked) leaves the key alone, so the browser's find opens there too.
 */
export const FindShortcuts = Extension.create<FindShortcutsOptions>({
  name: 'findShortcuts',

  addOptions() {
    return { onOpen: () => {} };
  },

  addKeyboardShortcuts() {
    const open = (mode: FindMode) => () => {
      if (!this.editor.isEditable) return false;
      this.options.onOpen(mode);
      return true;
    };
    // Cmd+H is "Hide" on macOS and never reaches a page, so Docs' Cmd/Ctrl+Shift+H works too.
    return { 'Mod-f': open('find'), 'Mod-h': open('replace'), 'Mod-Shift-h': open('replace') };
  },
});
