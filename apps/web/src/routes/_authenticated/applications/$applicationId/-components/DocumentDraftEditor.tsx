import { useEffect, useState, type RefObject } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { DocumentEditorToolbar } from './DocumentEditorToolbar';
import { DocumentEditorBubbleMenu } from './DocumentEditorBubbleMenu';
import { ALLOWED_LINK_PROTOCOLS, isAllowedLinkUri } from '#/lib/editorLinks';
import { useDebouncedCallback } from '#/hooks/useDebouncedCallback';
import type { TiptapNode } from '#/lib/markdownToTiptapDoc';

/**
 * What the AI helper panel may do to the visible editor (JEF-506). The
 * changes do not go through the editor's debounced save: the caller reads the
 * result back and saves it itself, so it knows when the save is done.
 */
export interface DocumentEditorHandle {
  getText: () => string;
  getJson: () => string;
  /** Swaps the whole document. Any edit still waiting out the save debounce is sent first. */
  replaceContent: (nodes: TiptapNode[]) => void;
  /** Adds blocks after the last one. */
  appendContent: (nodes: TiptapNode[]) => void;
  /** Puts the cursor at the start of the top-level block with this index. */
  focusBlock: (index: number) => void;
  /** Read-only while an AI request is in flight, so nothing typed meanwhile is overwritten. */
  setEditable: (editable: boolean) => void;
}

interface DocumentDraftEditorProps {
  contentJson: string;
  onUpdate: (json: string, plainText: string) => void;
  /**
   * Receives a function that sends any edit still waiting out the save
   * debounce to `onUpdate` immediately — for actions (export) that must not
   * run against content the server has not seen yet.
   */
  flushRef?: RefObject<(() => void) | null>;
  /** Receives the handle the AI helper drives the editor through. */
  editorRef?: RefObject<DocumentEditorHandle | null>;
  /** Called on every change with the live text, ahead of the save debounce. */
  onTextChange?: (plainText: string) => void;
  /** Called on every change with the live document JSON, ahead of the save debounce. */
  onJsonChange?: (json: string) => void;
}

export function DocumentDraftEditor({
  contentJson,
  onUpdate,
  flushRef,
  editorRef,
  onTextChange,
  onJsonChange,
}: DocumentDraftEditorProps) {
  let initialContent;
  try {
    initialContent = JSON.parse(contentJson);
  } catch {
    initialContent = undefined;
  }

  const debouncedUpdate = useDebouncedCallback((json: string, plainText: string) => {
    onUpdate(json, plainText);
  }, 1000);

  const flushPendingUpdate = debouncedUpdate.flush;
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = flushPendingUpdate;
    return () => {
      flushRef.current = null;
    };
  });

  const [editable, setEditable] = useState(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          protocols: [...ALLOWED_LINK_PROTOCOLS],
          isAllowedUri: (url) => isAllowedLinkUri(url),
        },
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON());
      const plainText = e.getText();
      onTextChange?.(plainText);
      onJsonChange?.(json);
      debouncedUpdate(json, plainText);
    },
  });

  useEffect(() => {
    if (!editorRef || !editor) return;
    editorRef.current = {
      getText: () => editor.getText(),
      getJson: () => JSON.stringify(editor.getJSON()),
      replaceContent: (nodes) => {
        flushPendingUpdate();
        editor.commands.setContent({ type: 'doc', content: nodes }, { emitUpdate: false });
      },
      appendContent: (nodes) => {
        flushPendingUpdate();
        editor.commands.insertContentAt(editor.state.doc.content.size, nodes);
      },
      focusBlock: (index) => {
        let pos = 0;
        editor.state.doc.forEach((_node, offset, i) => {
          if (i === index) pos = offset + 1;
        });
        editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
      },
      setEditable: (next) => {
        editor.setEditable(next, false);
        setEditable(next);
      },
    };
    return () => {
      editorRef.current = null;
    };
  });

  if (!editor) return null;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      <DocumentEditorToolbar editor={editor} editable={editable} />
      <EditorContent
        editor={editor}
        className="prose min-h-[400px] max-w-none p-4 focus:outline-none dark:prose-invert [&_.ProseMirror]:min-h-[360px] [&_.ProseMirror]:text-gray-900 [&_.ProseMirror]:outline-none [&_.ProseMirror]:dark:text-gray-100"
      />
      <DocumentEditorBubbleMenu editor={editor} editable={editable} />
    </div>
  );
}
