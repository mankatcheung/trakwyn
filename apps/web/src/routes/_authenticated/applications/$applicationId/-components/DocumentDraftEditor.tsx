import { useEffect, useRef, useState, type RefObject } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { DocumentEditorToolbar } from './DocumentEditorToolbar';
import { DocumentEditorBubbleMenu } from './DocumentEditorBubbleMenu';
import { SlashMenu } from './SlashMenu';
import { DocumentEditorStatusBar } from './DocumentEditorStatusBar';
import { countWords } from '#/lib/editor/countWords';
import { SlashCommand } from '#/lib/editor/SlashCommandExtension';
import { createSlashMenuController } from '#/lib/editor/slashMenuController';
import { SLASH_COMMANDS, filterSlashCommands } from '#/lib/editor/slashCommands';
import { useLocale } from '#/lib/i18n';
import { FindAndReplace } from '@tiptap/extension-find-and-replace';
import { DocumentEditorFindBar } from './DocumentEditorFindBar';
import { FindShortcuts, type FindMode } from '#/lib/editor/findShortcuts';
import { ALLOWED_LINK_PROTOCOLS, isAllowedLinkUri } from '#/lib/editorLinks';
import { useDebouncedCallback } from '#/hooks/useDebouncedCallback';
import type { TiptapNode } from '#/lib/markdownToTiptapDoc';

const PLACEHOLDER =
  '[&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_.is-editor-empty:first-child::before]:text-gray-500 [&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] dark:[&_.ProseMirror_.is-editor-empty:first-child::before]:text-gray-400';

const EDITOR_CONTENT_CLASS = `prose min-h-[400px] max-w-none p-4 focus:outline-none dark:prose-invert [&_.ProseMirror]:min-h-[360px] [&_.ProseMirror]:text-gray-900 [&_.ProseMirror]:outline-none [&_.ProseMirror]:dark:text-gray-100 ${PLACEHOLDER}`;

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
  /** Words the hint shown in an empty draft for what the draft is. */
  draftType?: 'resume' | 'cover_letter';
}

export function DocumentDraftEditor({
  contentJson,
  onUpdate,
  flushRef,
  editorRef,
  onTextChange,
  draftType,
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
  const { t } = useLocale();
  const [slashMenu] = useState(createSlashMenuController);
  // The editor is built once, so the slash filter reads the current language through a ref.
  const translate = useRef(t);
  const placeholderKey =
    draftType === 'cover_letter'
      ? 'documents.editor.placeholderCoverLetter'
      : draftType === 'resume'
        ? 'documents.editor.placeholderResume'
        : 'documents.editor.placeholder';
  const placeholderText = useRef(t(placeholderKey));
  useEffect(() => {
    translate.current = t;
    placeholderText.current = t(placeholderKey);
  }, [t, placeholderKey]);
  // The find bar (JEF-580). `signal` changes on every Cmd/Ctrl+F, so pressing it
  // while the bar is open puts the cursor back in the find field.
  const [find, setFind] = useState<{ mode: FindMode; signal: number } | null>(null);

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
      // A decoration, not content: it never reaches the saved JSON or the PDF export.
      Placeholder.configure({ placeholder: () => placeholderText.current }),
      CharacterCount.configure({ wordCounter: countWords }),
      SlashCommand.configure({
        controller: slashMenu,
        filter: (query) =>
          filterSlashCommands(SLASH_COMMANDS, query, (item) => translate.current(item.labelKey)),
      }),
      // Small documents: search as the user types, no debounce.
      FindAndReplace.configure({ searchDebounceMs: 0 }),
      FindShortcuts.configure({
        onOpen: (mode) => setFind((prev) => ({ mode, signal: (prev?.signal ?? 0) + 1 })),
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON());
      const plainText = e.getText();
      onTextChange?.(plainText);
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
      {find && (
        <DocumentEditorFindBar
          editor={editor}
          editable={editable}
          mode={find.mode}
          focusSignal={find.signal}
          onModeChange={(mode) => setFind((prev) => (prev ? { ...prev, mode } : prev))}
          onClose={() => setFind(null)}
        />
      )}
      <EditorContent editor={editor} className={EDITOR_CONTENT_CLASS} />
      <DocumentEditorStatusBar editor={editor} />
      <DocumentEditorBubbleMenu editor={editor} editable={editable} />
      <SlashMenu editor={editor} controller={slashMenu} />
    </div>
  );
}
