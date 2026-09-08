/**
 * Mobile twin of apps/web's `lib/proseToTiptapDoc.ts` (itself a twin of the
 * API's `use-cases/shared/proseToTiptapDoc.ts`).
 *
 * A blank line becomes an empty paragraph with **no** content array: a text
 * node holding an empty string is invalid in ProseMirror, which is exactly
 * what plain prose produces between every paragraph. The mobile editor edits
 * `plainText` directly (no ProseMirror on React Native) and only needs this
 * to produce a valid `contentJson` alongside it when saving.
 *
 * Duplicated rather than shared because `packages/shared` is empty and
 * neither app depends on it. If that changes, all three copies should become
 * one module.
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
