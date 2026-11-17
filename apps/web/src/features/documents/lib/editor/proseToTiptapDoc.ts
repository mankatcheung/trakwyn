/**
 * Client-side twin of the API's `use-cases/shared/proseToTiptapDoc.ts`.
 *
 * A blank line becomes an empty paragraph with **no** content array: a text
 * node holding an empty string is invalid in ProseMirror and makes the editor
 * throw when it loads the draft — which is exactly what prose produces,
 * between every paragraph.
 *
 * Duplicated rather than shared because `packages/shared` is empty and the web
 * app does not depend on it. If that changes, this and its API twin should
 * become one module.
 */
export function proseToTiptapDoc(text: string): { contentJson: string; plainText: string } {
  const plainText = text.trim();
  const lines = plainText.length > 0 ? plainText.split('\n') : [''];

  return {
    contentJson: JSON.stringify({
      type: 'doc',
      content: lines.map((line) =>
        line.trim().length > 0
          ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
          : { type: 'paragraph' },
      ),
    }),
    plainText,
  };
}
