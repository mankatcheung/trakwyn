import { useEffect, useRef, useState, type RefObject } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import TextAlign from '@tiptap/extension-text-align';
import { DocumentEditorToolbar } from './DocumentEditorToolbar';
import { DocumentEditorBubbleMenu } from './DocumentEditorBubbleMenu';
import { SlashMenu } from './SlashMenu';
import { DocumentEditorStatusBar } from './DocumentEditorStatusBar';
import { documentPageStyle } from '#/lib/documentPage';
import type { DocumentLanguageTag } from '#/lib/editor/documentLanguage';
import type { SaveStatus } from '#/lib/editor/saveState';
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

// The placeholder sits on the white page, which stays light in dark mode.
const PLACEHOLDER =
  '[&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_.is-editor-empty:first-child::before]:text-gray-500 [&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]';

// The page is the PDF's page (JEF-581): see `lib/documentPage.ts`. The surround is
// the theme's; the page itself is always white.
const PAGE_SURROUND = 'min-h-[400px] bg-gray-100 p-2 sm:p-6 dark:bg-gray-900';
const PAGE_CLASS = `document-page focus:outline-none ${PLACEHOLDER}`;

function editorAttributes(lang: string | undefined): Record<string, string> {
  return lang ? { spellcheck: 'true', lang } : { spellcheck: 'true' };
}

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
  /** Words the hint shown in an empty draft for what the draft is. */
  draftType?: 'resume' | 'cover_letter';
  /** Spell-check language (a BCP 47 tag) and the way to change it (JEF-579). */
  language?: { value: DocumentLanguageTag; onChange: (tag: DocumentLanguageTag) => void };
  /** The save state shown in the status line (JEF-577). */
  saveStatus?: SaveStatus;
}

export function DocumentDraftEditor({
  contentJson,
  onUpdate,
  flushRef,
  editorRef,
  onTextChange,
  onJsonChange,
  draftType,
  language,
  saveStatus,
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
      // Left, centre and right only: justify reads poorly in a narrow column and in ATS
      // parsing (JEF-578). No default, so a block nobody aligned stores nothing.
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
      }),
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
    // Spellcheck is asked for outright, not left to the browser's default, and checks
    // in the draft's language (JEF-579). The browser's own dictionary does it: no text is sent anywhere.
    editorProps: { attributes: editorAttributes(language?.value) },
    content: initialContent,
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON());
      const plainText = e.getText();
      onTextChange?.(plainText);
      onJsonChange?.(json);
      debouncedUpdate(json, plainText);
    },
  });

  // The editor is built once, so a language change is pushed into the live view.
  useEffect(() => {
    editor?.setOptions({ editorProps: { attributes: editorAttributes(language?.value) } });
  }, [editor, language?.value]);

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
      <div className={PAGE_SURROUND} data-testid="document-page-surround">
        <EditorContent
          editor={editor}
          className={PAGE_CLASS}
          style={documentPageStyle()}
          data-testid="document-page"
        />
      </div>
      <DocumentEditorStatusBar editor={editor} saveStatus={saveStatus} language={language} />
      <DocumentEditorBubbleMenu editor={editor} editable={editable} />
      <SlashMenu editor={editor} controller={slashMenu} />
    </div>
  );
}
