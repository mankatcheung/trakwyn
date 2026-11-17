import type { Editor } from '@tiptap/react';

/**
 * The slash menu's "Ask AI" (JEF-583) cannot open the AI prompt itself: the
 * prompt belongs to the layer that owns the request, and a slash command only
 * has the editor. It says so on the editor's element, and that layer listens.
 */
export const ASK_AI_EVENT = 'trakwyn:ask-ai';

export function requestAskAi(editor: Editor): void {
  editor.view.dom.dispatchEvent(new CustomEvent(ASK_AI_EVENT));
}
