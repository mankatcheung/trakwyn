import { useEditorState, type Editor } from '@tiptap/react';
import { useLocale } from '#/lib/i18n';
import { countWords } from '#/lib/editor/countWords';

function readCounts(editor: Editor) {
  const { characterCount } = editor.storage;
  const total = { words: characterCount.words(), characters: characterCount.characters() };
  const { from, to, empty } = editor.state.selection;
  if (empty) return { total, selected: null };

  // Same rules as the document total: blocks read as separate words, newlines are not characters.
  const wordsText = editor.state.doc.textBetween(from, to, ' ', ' ');
  const charactersText = editor.state.doc.textBetween(from, to, undefined, ' ');
  const selected = { words: countWords(wordsText), characters: charactersText.length };
  return { total, selected: selected.characters > 0 ? selected : null };
}

/**
 * The line under the editor (JEF-576): words and characters of the draft, or
 * "42 of 310 words" while text is selected. It reads from editor state, so a
 * keystroke re-renders this line and not the editor, and it counts what an AI
 * replace or append wrote just as it counts typing. The height is fixed so the
 * numbers changing width or the selection appearing never moves the page.
 */
export function DocumentEditorStatusBar({ editor }: { editor: Editor }) {
  const { t, formatNumber } = useLocale();
  const { total, selected } = useEditorState({
    editor,
    selector: ({ editor: e }) => readCounts(e),
  });

  const words = selected
    ? t('documents.editor.selectionWords', {
        count: total.words,
        selected: formatNumber(selected.words),
        formatted: formatNumber(total.words),
      })
    : t('documents.editor.wordCount', {
        count: total.words,
        formatted: formatNumber(total.words),
      });
  const characters = selected
    ? t('documents.editor.selectionCharacters', {
        count: total.characters,
        selected: formatNumber(selected.characters),
        formatted: formatNumber(total.characters),
      })
    : t('documents.editor.characterCount', {
        count: total.characters,
        formatted: formatNumber(total.characters),
      });

  return (
    <div
      data-testid="editor-status-bar"
      className="flex h-8 items-center gap-2 overflow-hidden rounded-b-lg border-t border-gray-200 bg-gray-50 px-3 text-xs whitespace-nowrap text-gray-600 tabular-nums dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
    >
      <span>{words}</span>
      <span aria-hidden="true">·</span>
      <span>{characters}</span>
    </div>
  );
}
