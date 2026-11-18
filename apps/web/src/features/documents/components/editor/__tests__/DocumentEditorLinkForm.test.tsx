import { beforeAll, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { DocumentEditorLinkForm } from '#/features/documents/components/editor/DocumentEditorLinkForm';
import {
  ALLOWED_LINK_PROTOCOLS,
  isAllowedLinkUri,
} from '#/features/documents/lib/editor/editorLinks';

// jsdom has no layout; ProseMirror asks for rects when it scrolls a selection into view.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () => rects;
});

const CONTENT = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello brave world' }] }],
};

interface HarnessProps {
  initial?: string;
  hasLink?: boolean;
  onClose: () => void;
  onEditor: (editor: Editor) => void;
}

function Harness({ initial = '', hasLink = false, onClose, onEditor }: HarnessProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          protocols: [...ALLOWED_LINK_PROTOCOLS],
          isAllowedUri: (url) => isAllowedLinkUri(url),
        },
      }),
    ],
    content: CONTENT,
  });
  if (!editor) return null;
  onEditor(editor);
  return (
    <div>
      <EditorContent editor={editor} />
      <DocumentEditorLinkForm
        editor={editor}
        initial={initial}
        hasLink={hasLink}
        onClose={onClose}
      />
    </div>
  );
}

function setup(props: Partial<Omit<HarnessProps, 'onClose' | 'onEditor'>> = {}) {
  let editor!: Editor;
  const onClose = vi.fn();
  render(
    <Harness
      {...props}
      onClose={onClose}
      onEditor={(e) => {
        editor = e;
      }}
    />,
  );
  act(() => {
    editor.commands.setTextSelection({ from: 1, to: 6 });
  });
  return {
    onClose,
    get editor() {
      return editor;
    },
  };
}

const field = () => screen.getByRole('textbox', { name: 'Link address' });

describe('DocumentEditorLinkForm', () => {
  it('starts with the address the selection already links to', () => {
    setup({ initial: 'https://example.com' });

    expect(field()).toHaveValue('https://example.com');
    expect(field()).toHaveAttribute('aria-invalid', 'false');
  });

  it('puts the link on the selection and closes', () => {
    const h = setup();

    fireEvent.change(field(), { target: { value: 'example.com' } });
    fireEvent.submit(field().closest('form')!);

    expect(h.editor.getHTML()).toContain('href="https://example.com"');
    expect(h.onClose).toHaveBeenCalledOnce();
  });

  it('rejects an address it cannot use, then clears the error when typing resumes', () => {
    const h = setup();

    fireEvent.change(field(), { target: { value: 'not a link' } });
    fireEvent.submit(field().closest('form')!);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAttribute('aria-describedby', 'editor-link-error');
    expect(h.editor.getHTML()).not.toContain('href');
    expect(h.onClose).not.toHaveBeenCalled();

    fireEvent.change(field(), { target: { value: 'example.com' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers Remove only where there is a link to remove', () => {
    const { unmount } = render(<Harness hasLink={false} onClose={() => {}} onEditor={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Remove link' })).not.toBeInTheDocument();
    unmount();

    setup({ hasLink: true });
    expect(screen.getByRole('button', { name: 'Remove link' })).toBeInTheDocument();
  });

  it('removes the link from the selection and closes', () => {
    const h = setup({ hasLink: true, initial: 'https://example.com' });
    act(() => {
      h.editor
        .chain()
        .setTextSelection({ from: 1, to: 6 })
        .setLink({ href: 'https://example.com' })
        .run();
    });
    expect(h.editor.getHTML()).toContain('href');

    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));

    expect(h.editor.getHTML()).not.toContain('href');
    expect(h.onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape without applying anything', () => {
    const h = setup();

    fireEvent.keyDown(field(), { key: 'Escape' });

    expect(h.onClose).toHaveBeenCalledOnce();
    expect(h.editor.getHTML()).not.toContain('href');
  });

  it('ignores other keys', () => {
    const h = setup();

    fireEvent.keyDown(field(), { key: 'a' });

    expect(h.onClose).not.toHaveBeenCalled();
  });
});
